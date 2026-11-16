/** @panki Saying a web setting is kept on this device alone, the quiet tag (`PerDevice`). Never a line saying so; never in the extension's options. */
import { PER_DEVICE } from "../words";

/**
 * "This device", a quiet tag beside the title of what's kept on this device alone, so it's always known what's per
 * device: a setting's (`Setting`'s `perDevice`) or a whole tab's, at its head. Everything
 * untagged is the account's, so nothing says that. For the web app's settings alone, where some are the account's and
 * some the device's; never on the extension's options page, where everything is that browser's own (it's the
 * extension), so the tag would say nothing.
 */
export function PerDevice() {
  return <span className="per-device">{PER_DEVICE}</span>;
}
