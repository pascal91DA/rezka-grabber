export interface Category {
  label: string;
  basePath: string;
  filter: string;
}

export const CATEGORIES: Category[] = [
  {label: 'Последние', basePath: 'new', filter: 'last'},
  {label: 'Популярное', basePath: 'new', filter: 'popular'},
  {label: 'Сейчас смотрят', basePath: 'new', filter: 'watching'},
  {label: 'Фильмы', basePath: 'films', filter: 'last'},
  {label: 'Сериалы', basePath: 'series', filter: 'last'},
  {label: 'Мультфильмы', basePath: 'cartoons', filter: 'last'},
  {label: 'Аниме', basePath: 'animation', filter: 'last'},
];
