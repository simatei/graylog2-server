/*
 * Copyright (C) 2020 Graylog, Inc.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the Server Side Public License, version 1,
 * as published by MongoDB, Inc.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * Server Side Public License for more details.
 *
 * You should have received a copy of the Server Side Public License
 * along with this program. If not, see
 * <http://www.mongodb.com/licensing/server-side-public-license>.
 */
import URI from 'urijs';
import { useHistory, useLocation } from 'react-router-dom';

import useQuery from 'routing/useQuery';

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZES = [10, 20, 50, 100];

export type PaginationQueryParameterResult = {
  page: number;
  resetPage: () => void;
  pageSize: number;
  setPagination: (payload: { page?: number, pageSize?: number }) => void;
};

const usePaginationQueryParameter = (PAGE_SIZES: number[] = DEFAULT_PAGE_SIZES, defaultPageSize: number = DEFAULT_PAGE_SIZES[0]): PaginationQueryParameterResult => {
  const { page: pageQueryParameter, pageSize: pageSizeQueryParameter } = useQuery();
  const history = useHistory();
  const { search, pathname } = useLocation();
  const query = pathname + search;
  const pageQueryParameterAsNumber = Number(pageQueryParameter);
  const page = (Number.isInteger(pageQueryParameterAsNumber) && pageQueryParameterAsNumber > 0) ? pageQueryParameterAsNumber : DEFAULT_PAGE;

  const pageSizeQueryParameterAsNumber = Number(pageSizeQueryParameter);
  const pageSize = (Number.isInteger(pageSizeQueryParameterAsNumber) && PAGE_SIZES?.includes(pageSizeQueryParameterAsNumber)) ? pageSizeQueryParameterAsNumber : defaultPageSize;

  const setPagination = ({ page: newPage = page, pageSize: newPageSize = pageSize }: { page?: number, pageSize?: number }) => {
    const uri = new URI(query).setSearch({ page: String(newPage), pageSize: String(newPageSize) });
    history.replace(uri.toString());
  };

  const resetPage = () => {
    setPagination({ page: DEFAULT_PAGE });
  };

  return { page, resetPage, pageSize, setPagination };
};

export default usePaginationQueryParameter;
