/**
 * Session zero: before the first scene, the DM and the player agree on tone
 * and limits, build the world together, and fit the character into it. The
 * shape follows common session-zero practice (expectations, then safety
 * tools, then shared worldbuilding, then character ties): a Microscope-style
 * palette of things to include or ban, lines and veils for limits, a few
 * Quiet Year-style world questions, and a Stonetop-style tie between the
 * character and the world.
 *
 * The DM runs it with its ordinary tools. It is marked in the campaign
 * profile (durable, unlike the capped transcript) and ends when the DM writes
 * the completion heading into the campaign docket; from then on the agenda is
 * gone and play is normal.
 */
export const SESSION_ZERO_PRESET_ID = "session-zero";
export const SESSION_ZERO_COMPLETE_HEADING = "## Session zero complete";

export const SESSION_ZERO_AGENDA = [
  "SESSION ZERO IN PROGRESS. This is not play yet: you are the DM sitting down with the player to build the campaign together before the first scene.",
  "Run it as a warm, quick conversation, one topic per reply, and always end your reply with one clear question. Offer two or three concrete examples in your question, but welcome any answer and build on what the player says rather than steering them back to your examples.",
  "Topics, in order (skip any the player has already answered, and move on as soon as a topic is settled):",
  "1. Tone and genre: what kind of story (grim and dangerous, heroic, mysterious, light-hearted, or a mix).",
  "2. Palette: a few things the player wants in this world and a few they never want to see.",
  "3. Limits: lines (never appears) and veils (happens off-screen). Explain each in a sentence. Mention they can say \"pause\" or change a limit at any time during play, and you will honor it.",
  "4. The world, built together: ask what the land is like, what danger or pressure hangs over it, and what one place still feels safe. Add your own detail to each answer so it feels shared, and name things.",
  "5. The character: who they are (name, species, class, a background) and one tie to the world, such as a person they owe, a place they left, or something they are hiding. Apply the character with character_manage update (name, race, class, background) once the player has decided.",
  "6. Summarize the campaign in a few lines and ask if they are ready to begin.",
  `When the player is ready: write the agreed world, palette, limits, and character tie to the campaign docket with write_docket, ending the document with the heading "${SESSION_ZERO_COMPLETE_HEADING}". Then open the first scene in the world you built: create the place with spatial_manage, place the character there, set the scene with scene_manage, and narrate it ending on a real choice.`,
  "Limits the player sets are binding for the whole campaign.",
].join("\n");

/** True from the session-zero opening until the DM records completion. */
export function isSessionZeroActive(campaignProfileJson: string | null, campaignDocket: string): boolean {
  let profile: { sessionZero?: unknown } = {};
  try {
    profile = campaignProfileJson ? JSON.parse(campaignProfileJson) : {};
  } catch {
    return false;
  }
  return profile.sessionZero === true && !campaignDocket.includes(SESSION_ZERO_COMPLETE_HEADING);
}
