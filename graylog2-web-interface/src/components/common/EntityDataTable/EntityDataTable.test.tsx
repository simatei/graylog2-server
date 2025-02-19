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
import React from 'react';
import { render, screen, waitFor } from 'wrappedTestingLibrary';
import { defaultUser } from 'defaultMockValues';
import Immutable from 'immutable';
import userEvent from '@testing-library/user-event';

import { asMock } from 'helpers/mocking';
import useCurrentUser from 'hooks/useCurrentUser';

import EntityDataTable from './EntityDataTable';

jest.mock('hooks/useCurrentUser');

describe('<EntityDataTable />', () => {
  beforeEach(() => {
    asMock(useCurrentUser).mockReturnValue(defaultUser);
  });

  const columnDefinitions = [
    { id: 'title', title: 'Title', sortable: true },
    { id: 'description', title: 'Description', sortable: true },
    { id: 'stream', title: 'Stream', sortable: true },
    { id: 'status', title: 'Status', sortable: true, permissions: ['status:read'] },
  ];

  const visibleColumns = ['title', 'description', 'status'];
  const data = [
    {
      id: 'row-id',
      title: 'Row title',
      description: 'Row description',
      stream: 'Row stream',
      status: 'enabled',
    },
  ];

  it('should render selected columns and table headers', async () => {
    render(<EntityDataTable visibleColumns={visibleColumns}
                            data={data}
                            onColumnsChange={() => {}}
                            onSortChange={() => {}}
                            columnDefinitions={columnDefinitions} />);

    await screen.findByRole('columnheader', { name: /title/i });
    await screen.findByRole('columnheader', { name: /status/i });

    await screen.findByText('Row title');
    await screen.findByText('enabled');

    expect(screen.queryByRole('columnheader', { name: /stream/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Row Stream')).not.toBeInTheDocument();
  });

  it('should render default cell renderer', async () => {
    render(<EntityDataTable visibleColumns={visibleColumns}
                            data={data}
                            onSortChange={() => {}}
                            onColumnsChange={() => {}}
                            columnDefinitions={columnDefinitions} />);

    await screen.findByRole('columnheader', { name: /description/i });
    await screen.findByText('Row description');
  });

  it('should render custom cell and header renderer', async () => {
    render(<EntityDataTable visibleColumns={visibleColumns}
                            data={data}
                            onSortChange={() => {}}
                            onColumnsChange={() => {}}
                            columnRenderers={{
                              title: {
                                renderCell: (listItem) => `The title: ${listItem.title}`,
                                renderHeader: (column) => `Custom ${column.title} Header`,
                              },
                            }}
                            columnDefinitions={columnDefinitions} />);

    await screen.findByRole('columnheader', { name: /custom title header/i });
    await screen.findByText('The title: Row title');
  });

  it('should render row actions', async () => {
    render(<EntityDataTable<{ id: string, title: string }> visibleColumns={visibleColumns}
                                                           data={data}
                                                           onSortChange={() => {}}
                                                           onColumnsChange={() => {}}
                                                           rowActions={(row) => `Custom actions for ${row.title}`}
                                                           columnDefinitions={columnDefinitions} />);

    await screen.findByText('Custom actions for Row title');
  });

  it('should not render column if user does not have required permissions', () => {
    asMock(useCurrentUser).mockReturnValue(defaultUser.toBuilder().permissions(Immutable.List()).build());

    render(<EntityDataTable visibleColumns={visibleColumns}
                            data={data}
                            onSortChange={() => {}}
                            onColumnsChange={() => {}}
                            columnDefinitions={columnDefinitions} />);

    expect(screen.queryByRole('columnheader', { name: /status/i })).not.toBeInTheDocument();
    expect(screen.queryByText('enabled')).not.toBeInTheDocument();
  });

  it('should display active sort', async () => {
    render(<EntityDataTable visibleColumns={visibleColumns}
                            data={data}
                            onSortChange={() => {}}
                            onColumnsChange={() => {}}
                            activeSort={{
                              attributeId: 'description',
                              direction: 'asc',
                            }}
                            columnDefinitions={columnDefinitions} />);

    await screen.findByTitle(/sort description descending/i);
  });

  it('should sort based on column', async () => {
    const onSortChange = jest.fn();

    render(<EntityDataTable visibleColumns={visibleColumns}
                            data={data}
                            onSortChange={onSortChange}
                            onColumnsChange={() => {}}
                            columnDefinitions={columnDefinitions} />);

    userEvent.click(await screen.findByTitle(/sort description ascending/i));

    await waitFor(() => expect(onSortChange).toHaveBeenCalledTimes(1));

    expect(onSortChange).toHaveBeenCalledWith({ attributeId: 'description', direction: 'asc' });
  });

  it('should provide selected item ids for bulk actions', async () => {
    const renderBulkActions = jest.fn(() => <div>Custom bulk actions</div>);

    render(<EntityDataTable visibleColumns={visibleColumns}
                            data={data}
                            onSortChange={() => {}}
                            onColumnsChange={() => {}}
                            bulkActions={renderBulkActions}
                            columnDefinitions={columnDefinitions} />);

    const rowCheckboxes = await screen.findAllByRole('checkbox', { name: /select entity/i });
    userEvent.click(rowCheckboxes[0]);

    await screen.findByText('Custom bulk actions');

    await waitFor(() => expect(renderBulkActions).toHaveBeenCalledWith(['row-id'], expect.any(Function)));
  });

  it('should provide bulk actions with function to update selected items', async () => {
    const selectedItemInfo = '1 item selected';
    const renderBulkActions = (_selectedItemIds: Array<string>, setSelectedItemIds: (selectedItemIds: Array<string>) => void) => (
      <button onClick={() => setSelectedItemIds([])} type="button">Reset selection</button>
    );
    asMock(useCurrentUser).mockReturnValue(defaultUser.toBuilder().permissions(Immutable.List()).build());

    render(<EntityDataTable visibleColumns={visibleColumns}
                            data={data}
                            onSortChange={() => {}}
                            onColumnsChange={() => {}}
                            bulkActions={renderBulkActions}
                            columnDefinitions={columnDefinitions} />);

    const rowCheckboxes = await screen.findAllByRole('checkbox', { name: /select entity/i });
    userEvent.click(rowCheckboxes[0]);

    await screen.findByText(selectedItemInfo);
    const customBulkAction = await screen.findByRole('button', { name: /reset selection/i });

    userEvent.click(customBulkAction);

    expect(screen.queryByText(selectedItemInfo)).not.toBeInTheDocument();
    expect(rowCheckboxes[0]).not.toBeChecked();
  });

  it('should select all items', async () => {
    asMock(useCurrentUser).mockReturnValue(defaultUser.toBuilder().permissions(Immutable.List()).build());

    render(<EntityDataTable visibleColumns={visibleColumns}
                            data={data}
                            onSortChange={() => {}}
                            onColumnsChange={() => {}}
                            bulkActions={() => <div />}
                            columnDefinitions={columnDefinitions} />);

    const rowCheckboxes = await screen.findAllByRole('checkbox', { name: /select entity/i });

    expect(rowCheckboxes[0]).not.toBeChecked();

    const selectAllCheckbox = await screen.findByRole('checkbox', { name: /select all visible entities/i });
    userEvent.click(selectAllCheckbox);

    expect(rowCheckboxes[0]).toBeChecked();

    await screen.findByText('1 item selected');

    userEvent.click(selectAllCheckbox);

    expect(rowCheckboxes[0]).not.toBeChecked();
  });

  it('should call onColumnsChange when changing column visibility', async () => {
    const onColumnsChange = jest.fn();

    render(<EntityDataTable visibleColumns={['description', 'status']}
                            data={data}
                            onSortChange={() => {}}
                            onColumnsChange={onColumnsChange}
                            bulkActions={() => <div />}
                            columnDefinitions={columnDefinitions} />);

    userEvent.click(screen.getByRole('button', { name: /select columns to display/i }));
    userEvent.click(screen.getByRole('menuitem', { name: /show title/i }));

    expect(onColumnsChange).toHaveBeenCalledWith(['description', 'status', 'title']);
  });
});
