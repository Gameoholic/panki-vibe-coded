import { sizeWords, type Space } from "@panki/contracts";

/**
 * Said at the top of the home, to everyone signed in, while the disk Panki keeps its data on is nearly full. Whether
 * it is, is the API's to say (`space.low`); nothing shows otherwise.
 */
export function SpaceNotice({ space }: { space: Space }) {
  if (!space.low) return null;
  return (
    <section className="panel panel-alarm" role="status" aria-labelledby="space-notice">
      <p id="space-notice" className="question">
        Panki is nearly out of room
      </p>
      <p className="empty">
        {sizeWords(space.freeBytes)} is left of {sizeWords(space.totalBytes)} where it keeps your cards and their clips. When that's gone, new clips won't save.
      </p>
    </section>
  );
}
