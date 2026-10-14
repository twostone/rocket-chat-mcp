/**
 * The structured result returned by the `draft-message` tool. This is exactly
 * what the composer renders and edits, and every field it needs to resend the
 * message (roomName, tmid) is carried here so the view does not have to
 * correlate a separate tool-input payload.
 */
export interface DraftPayload {
  /** Room name to pass back to `send-message`. */
  roomName: string;
  room: {
    /** Ready-to-display label, e.g. "#general", "+ops", "@alice". */
    displayName: string;
    kind: "channel" | "group" | "dm";
  };
  /** The authenticated user (who is composing). */
  sender: {
    username: string;
    name: string | null;
    avatarUrl: string | null;
  };
  /** Present only when drafting a thread reply. */
  parent?: {
    username: string;
    name: string | null;
    avatarUrl: string | null;
    message: string;
  };
  /** Parent message id to pass to `send-message`, or undefined. */
  tmid?: string;
  /** The model's proposed text; pre-fills the editor. */
  message: string;
}
