/**
 * The organizer's own celebrations, remembered ONLY in this browser.
 * The manage token stored here is what lets this browser end a show early.
 */
export interface SavedCelebration {
  id: string
  manageToken: string
  birthdayName: string
  expiresAt: string
}

const KEY = 'birthday-theatre.my-celebrations'

export function loadMyCelebrations(): SavedCelebration[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as SavedCelebration[]
    return list.filter((c) => Date.parse(c.expiresAt) > Date.now())
  } catch {
    return []
  }
}

function save(list: SavedCelebration[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // Private mode / storage disabled: the share link still works, we just can't remember it.
  }
}

export function rememberCelebration(c: SavedCelebration) {
  save([c, ...loadMyCelebrations().filter((x) => x.id !== c.id)])
}

export function forgetCelebration(id: string) {
  save(loadMyCelebrations().filter((x) => x.id !== id))
}
