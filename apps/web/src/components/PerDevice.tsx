/** @panki Saying a setting is kept on this device alone, the quiet tag (`PerDevice`). Never a line under a setting saying so. */
import { PER_DEVICE } from "../words";

/**
 * "This device", a quiet tag beside the title of what's kept on this device alone, so it's always known what's per
 * device: a setting's (`Setting`'s `perDevice`) or a whole tab's, at its head. Everything
 * untagged is the account's, so nothing says that.
 */
export function PerDevice() {
  return <span className="per-device">{PER_DEVICE}</span>;
}
