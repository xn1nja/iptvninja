/**
 * Whether any stream has actually played since launch.
 *
 * This exists to keep the player honest. Expo Go applies its own network
 * permissions, so a plain-HTTP stream failing there *can* be App Transport
 * Security — but once any stream has played, ATS is ruled out as an
 * explanation, and blaming it would send someone off building a development
 * build to fix a channel that is simply offline.
 */
let played = false;

export function markStreamPlayed(): void {
  played = true;
}

export function hasAnyStreamPlayed(): boolean {
  return played;
}
