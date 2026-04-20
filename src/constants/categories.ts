export interface ContentFilter {
  label: string;
  filter: string;
}

export interface ContentType {
  label: string;
  basePath: string;
}

export const CONTENT_FILTERS: ContentFilter[] = [
  {label: 'Последние', filter: 'last'},
  {label: 'Популярные', filter: 'popular'},
  {label: 'Сейчас смотрят', filter: 'watching'},
];

export const CONTENT_TYPES: ContentType[] = [
  {label: 'Все', basePath: 'new'},
  {label: 'Фильмы', basePath: 'films'},
  {label: 'Сериалы', basePath: 'series'},
  {label: 'Мультфильмы', basePath: 'cartoons'},
  {label: 'Аниме', basePath: 'animation'},
];

// Совместимость со старым кодом, если где-то используется Category
export interface Category {
  label: string;
  basePath: string;
  filter: string;
}

export const CATEGORIES: Category[] = CONTENT_TYPES.flatMap(type =>
  CONTENT_FILTERS.map(f => ({label: `${type.label} ${f.label}`, basePath: type.basePath, filter: f.filter}))
);
