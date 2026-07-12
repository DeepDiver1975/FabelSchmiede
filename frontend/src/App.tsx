import { useState } from "react";
import { PickerView } from "./PickerView.js";
import { PlayView } from "./PlayView.js";
import { ReplayView } from "./ReplayView.js";
import type { State } from "./api.js";

type View =
  | { name: "picker" }
  | { name: "play"; state: State }
  | { name: "replay"; campaignId: string; campaignName: string };

export default function App() {
  const [view, setView] = useState<View>({ name: "picker" });

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

  return (
    <PickerView
      onOpen={(state) =>
        state.campaign.status === "finished"
          ? setView({
              name: "replay",
              campaignId: state.campaign.id,
              campaignName: state.campaign.name,
            })
          : setView({ name: "play", state })
      }
    />
  );
}
