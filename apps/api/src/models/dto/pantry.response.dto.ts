import { Pantry } from '@pantry-finder/types';

export interface Pagination {
  page: number;
  pageSize: number;
  hasNextPage: boolean;
  nextPage?: number;
}

export interface GetPantriesResponseDto {
  pantries: Pantry[];
  pagination: Pagination;
}
