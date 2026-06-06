import { Pantry } from '@pantry-finder/shared';

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
