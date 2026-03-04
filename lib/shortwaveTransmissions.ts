export type BreachMode = "military" | "et" | "member";

export const TRANSMISSION_AUDIO_BASE_PATH = "/audio/transmissions";
export const BED_LOOP_AUDIO_PATHS = [
  "/audio/bed/bed_loop_01.mp3",
  "/audio/bed/bed_loop_02.mp3",
  "/audio/bed/bed_loop_03.mp3"
] as const;
export const BED_BURST_AUDIO_PATHS = [
  "/audio/bed/burst_static_01.mp3",
  "/audio/bed/burst_static_02.mp3",
  "/audio/bed/burst_modem_01.mp3",
  "/audio/bed/burst_keyclick_01.mp3"
] as const;
export const CONTROL_CUE_AUDIO_PATHS = {
  forceGlitch: "/audio/controls/force_glitch.mp3",
  forceRedAlert: "/audio/controls/force_red_alert.mp3"
} as const;

export const MILITARY_TRANSMISSIONS = [
  "Command Net Seven, confirm relay. Patrol element crossed grid Delta-Four-Seven by Delta-Nine-Two; thermal trace indicates two unknowns shadowing the route at a controlled pace.",
  "Ops to Raven Team: hold noise discipline and maintain dark posture. Last beacon from Outpost Kilo was logged at grid Echo-Two-One; proceed as if the channel is monitored.",
  "All stations, this is Overwatch Control. We have unscheduled movement along sector line Gamma-Nine; lock the perimeter and report only verified contacts.",
  "Recon unit reports intermittent carrier bleed on primary frequency. Shift to backup net, run challenge and response, and treat every delayed reply as compromised.",
  "Forward command acknowledges partial comms failure near grid Foxtrot-Six-Three. Continue extraction protocol and mark all visual signals as unreliable until authenticated.",
  "Checkfire directive in effect. Repeat, checkfire directive in effect. Unknown voice traffic is imitating command cadence on open net with one-point-four-second lag.",
  "Convoy Lead, reroute east of grid Hotel-Three-Eight. Access road is intact but the signal corridor is unstable and we cannot verify remote detonation controls.",
  "Night watch to base, we are receiving clipped telemetry from the ridge array. The pattern is procedural, but no valid station identifier is attached.",
  "Command confirms zero friendly signatures beyond checkpoint Sierra. If you hear your own callsign repeated from the valley, do not answer and continue movement.",
  "Final update before blackout window: objective package secured at grid Lima-Five-One. We are running cold transit under comms silence until the handoff point."
] as const;

export const ET_TRANSMISSIONS = [
  "Carrier drift increasing. The same coordinate is arriving from three different angles, and each angle claims to be the center.",
  "Signal integrity warning: horizon marker does not align with instrument return. If the corridor appears longer than memory, trust the meter, not your sightline.",
  "Unidentified relay is speaking in familiar timing but not familiar space. Each pause is wider than the one before it, as if distance is being inserted between words.",
  "We mapped the anomaly twice and produced four valid maps. All four routes return to the same door, and none of the doors face the same direction.",
  "Audio bleed contains reversed fragments of our own command phrases. Do not mirror them aloud; repetition appears to strengthen the carrier lock.",
  "Field note: shadows are delayed by roughly half a second and drifting in the wrong direction. Personnel are instructed to move by tether until drift resolves.",
  "Sensor package recorded a staircase where no elevation exists. The team climbed six steps and arrived at the same floor with different wall geometry.",
  "Channel noise now includes tones below documented hearing range. Operators report pressure behind the eyes moments before the room dimensions begin to flex.",
  "Transit beacon split into two coherent identities and both passed authentication. One indicates safe entry, the other reports the entry point has already been removed.",
  "The signal says the gate is open; the gate says the signal was never sent. Maintain visual contact with your partner and narrate every turn in real time."
] as const;

export const MEMBER_SCENARIOS = [
  "Primary: Member courier Elm missed the 0200 checkpoint by sixteen minutes. Secondary: Last known signal fixed near the old service tunnel behind compound storage.",
  "Primary: Internal watch notes two unassigned badges moved through the west hall. Secondary: Camera feed is live, but each frame arrives in the wrong order.",
  "Primary: Cider never reached the compound; her final beacon collapsed north of Marker Seven. Secondary, quieter: We move now to bring her home, but command should log this as a probable one-way recovery.",
  "Primary: South fence alarm tripped once, then reset itself without command input. Secondary: Team Bravo is running manual sweep with lights out and open channel.",
  "Primary: Member Jun reported a voice from inside the archive room after lock verification. Secondary: The room was empty, but the desk recorder contained a fresh reply.",
  "Primary: Last known signal from Iris came through the generator corridor with heavy packet loss. Secondary: She requested no backup, then transmitted a location she could not have seen.",
  "Primary: Compound med bay confirms no injuries on roster. Secondary: Three members still entered at dawn asking who authorized the evacuation order.",
  "Primary: Team chatter indicates an unmarked vehicle outside the north gate with no engine noise. Secondary: Gate camera confirms shape and heat, but not a readable plate.",
  "Primary: Member Rowan dropped a short burst from the lower bunker. Secondary: We copied only one phrase clearly, keep the inner doors sealed until roll call completes.",
  "Primary: Patrol found a flashlight and sealed packet at the creek approach. Secondary: Both items are tagged to members currently standing in this room."
] as const;

export function randomInt(min: number, max: number): number {
  const lower = Math.ceil(Math.min(min, max));
  const upper = Math.floor(Math.max(min, max));
  return Math.floor(Math.random() * (upper - lower + 1)) + lower;
}

export function pickNonRepeatingIndex(length: number, previousIndex: number | null): number {
  if (length <= 1) {
    return 0;
  }

  let nextIndex = randomInt(0, length - 1);
  while (nextIndex === previousIndex) {
    nextIndex = randomInt(0, length - 1);
  }
  return nextIndex;
}

export function scrambleOneFrame(label: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%!?";
  const chars = label.split("");
  return chars
    .map((char) => {
      if (char === " " || char === "-") {
        return char;
      }
      return alphabet[randomInt(0, alphabet.length - 1)];
    })
    .join("");
}

function padTwo(value: number): string {
  return String(value).padStart(2, "0");
}

export function transmissionAudioSrc(mode: BreachMode, index: number): string {
  return `${TRANSMISSION_AUDIO_BASE_PATH}/${mode}/${padTwo(index + 1)}.mp3`;
}
