import { useState } from "react";
import { PickerView } from "./PickerView.js";
import { SetupView } from "./SetupView.js";
import { PlayView } from "./PlayView.js";
import { ReplayView } from "./ReplayView.js";
import type { State } from "./api.js";

type View =
  | { name: "picker" }
  | { name: "setup"; state: State }
  | { name: "play"; state: State }
  | { name: "replay"; campaignId: string; campaignName: string };

// Route a campaign's state to the right screen: finished → replay, no opening
// yet (zero turns, still in setup) → setup, otherwise → play.
function viewForState(state: State): View {
  if (state.campaign.status === "finished") {
    return { name: "replay", campaignId: state.campaign.id, campaignName: state.campaign.name };
  }
  if (state.turns.length === 0) {
    return { name: "setup", state };
  }
  return { name: "play", state };
}

export default function App() {
  const [view, setView] = useState<View>({ name: "picker" });

  if (view.name === "setup") {
    return (
      <SetupView
        initial={view.state}
        onBegin={(state) => setView({ name: "play", state })}
        onBack={() => setView({ name: "picker" })}
      />
    );
  }

  if (view.name === "play") {
    return (
      <PlayView
        initial={view.state}
        onBack={() => setView({ name: "picker" })}
        onFinished={(campaignId) =>
          setView({ name: "replay", campaignId, campaignName: view.state.campaign.name })
        }
      />
    );
  }

  if (view.name === "replay") {
    return (
      <ReplayView
        campaignId={view.campaignId}
        campaignName={view.campaignName}
        onBack={() => setView({ name: "picker" })}
      />
    );
  }

  return <PickerView onOpen={(state) => setView(viewForState(state))} />;
}
