// Board seal mark — a decorative tile in the PGPZ board identity: an evergreen
// tile, a gold plain-ring motif and a paper centre dot. It carries no text and
// no official Zcash roundel, so it stays decorative (aria-hidden) and needs no
// external Logo link. The ring is a plain circle brand motif, not a roundel.
export function BoardMark() {
  return <span className="board-mark" aria-hidden="true" />;
}
