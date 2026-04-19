export interface GetPantriesRequestDto {
  address: string;
  radius: number; // in miles
  page: number;
}
