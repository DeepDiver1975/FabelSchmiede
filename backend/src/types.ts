export type DiceRequest = { reason: string; hint: string };

export type GmReply = {
  narration: string;
  diceRequest: DiceRequest | null;
};

// Orthogonal to `role` (who is speaking): `kind` says whether a turn advances
// the story or is a side note. Absent/omitted always means "story" — asides
// are the opt-in exception, not the default.
export type TurnKind = "story" | "aside";

// A turn in the conversation history. `diceRequest` is optional so callers may
// omit it (e.g. player turns, or the opening gm turn which is dropped from the
// message list); when a gm turn is replayed to the model it is folded back into
// the JSON envelope so the conversation stays consistent with the system prompt.
export type Turn = {
  role: "gm" | "player";
  text: string;
  diceRequest?: DiceRequest | null;
  kind?: TurnKind;
};

export type CampaignStatus = "active" | "finished";

export type Campaign = {
  id: string;
  name: string;
  premise: string;
  status: CampaignStatus;
  created_at: string;
  finished_at: string | null;
};

export type CampaignSummary = {
  id: string;
  name: string;
  status: CampaignStatus;
  created_at: string;
  finished_at: string | null;
};

export type StoredTurn = {
  role: "gm" | "player";
  text: string;
  diceRequest: DiceRequest | null;
  kind?: TurnKind;
};

export type Story = {
  markdown: string;
  generated_at: string;
};

// --- Characters -----------------------------------------------------------
//
// One progressively-detailed shape covers the whole spectrum: a minimal
// character carries only the required core (id/name/concept) plus optional
// narrative flavour to feed the storytelling; a full sheet additionally fills
// in progression, abilities and consumable resources so the rule engine can
// validate mechanical actions (e.g. "cast firewall"). Nothing beyond the core
// is required — populating more fields unlocks more validation, never a new
// type. See ruleEngine.ts for how these fields gate actions.

// A learnable ability/spell/move the character *knows*. `minLevel` and
// `slotCost` are the machine-readable gate the rule engine checks; `slotCost`
// of 0 marks an at-will ability (a cantrip analog) that consumes no resource.
export type Ability = {
  id: string;
  name: string;
  minLevel: number;
  slotCost: number;
};

// A consumable resource pool, modelled as a counter the engine decrements.
// `available` is the ceiling; `used` is how much is spent this rest cycle.
export type ResourcePool = {
  id: string;
  name: string;
  used: number;
  available: number;
};

// Free-form flavour fed to the LLM as prose. Never gates anything.
export type CharacterNarrative = {
  backstory?: string;
  personality?: string;
  ideal?: string;
  bond?: string;
  flaw?: string;
  appearance?: string;
};

export type Character = {
  id: string;
  campaign_id: string;
  name: string;
  // The "class"/archetype analog — a free string at the minimal tier.
  concept: string;
  // Optional mechanical detail. Absent fields simply mean "not tracked yet".
  level?: number;
  narrative?: CharacterNarrative;
  abilities?: Ability[];
  resources?: ResourcePool[];
  created_at: string;
};

// Fields a caller supplies when creating a character. The store owns id,
// campaign_id and created_at.
export type CharacterInput = {
  name: string;
  concept: string;
  level?: number;
  narrative?: CharacterNarrative;
  abilities?: Ability[];
  resources?: ResourcePool[];
};

// JSON Schema for Bedrock structured output (output_config.format).
// Note: string minLength/maxLength are NOT supported by structured outputs — omit them.
export const GM_REPLY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["narration", "diceRequest"],
  properties: {
    narration: { type: "string" },
    diceRequest: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["reason", "hint"],
          properties: {
            reason: { type: "string" },
            hint: { type: "string" },
          },
        },
        { type: "null" },
      ],
    },
  },
} as const;
