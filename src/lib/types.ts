/** Everything the birthday experience needs to play. */
export interface CelebrationData {
  birthdayName: string
  godName: string
  customMessage: string | null
  /** Exactly 4 image URLs: [top-left, top-right, bottom-left, bottom-right] */
  photos: string[]
  /** Organizer's own image revealed inside the cut cake. null -> a cake slice rises instead. */
  surprise: string | null
  /** Organizer's own song. null -> the default Happy Birthday song is used. */
  audio: string | null
  /** ISO time. null in organizer preview mode. */
  expiresAt: string | null
}
