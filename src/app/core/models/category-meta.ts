// Display metadata for place categories. Colours live in styles.css under [data-category].
const CATEGORY_ICONS: Record<string, string> = {
  Religious: 'bi-brightness-alt-high',
  Heritage: 'bi-bank',
  Cultural: 'bi-book-half',
  Nature: 'bi-tree'
};

export function categoryIcon(category: string): string {
  return CATEGORY_ICONS[category] ?? 'bi-geo-alt';
}

export const ALL_CATEGORIES = ['Religious', 'Heritage', 'Cultural', 'Nature'];
