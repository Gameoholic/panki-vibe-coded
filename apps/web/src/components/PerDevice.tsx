import { PER_DEVICE } from "../words";

/**
 * "This device", a quiet tag beside the title of what's kept on this device alone (the owner, 2026-11-02: "I want as a
 * user to know what's per device"): a setting's (`Setting`'s `perDevice`) or a whole tab's, at its head. Everything
 * untagged is the account's, so nothing says that.
 */
export function PerDevice() {
  return <span className="per-device">{PER_DEVICE}</span>;
}
