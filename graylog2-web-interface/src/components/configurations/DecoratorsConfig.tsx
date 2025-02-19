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
import React, { useEffect, useState } from 'react';
import { groupBy } from 'lodash';

import { Button } from 'components/bootstrap';
import { IfPermitted } from 'components/common';
import Spinner from 'components/common/Spinner';
import { DecoratorsActions } from 'stores/decorators/DecoratorsStore';
import type { Stream } from 'stores/streams/StreamsStore';
import { StreamsActions } from 'stores/streams/StreamsStore';
import UserNotification from 'util/UserNotification';
import DecoratorList from 'views/components/messagelist/decorators/DecoratorList';
import type { Decorator } from 'views/components/messagelist/decorators/Types';

import DecoratorsConfigUpdate from './decorators/DecoratorsConfigUpdate';
import StreamSelect, { DEFAULT_SEARCH_ID, DEFAULT_STREAM_ID } from './decorators/StreamSelect';
import DecoratorsUpdater from './decorators/DecoratorsUpdater';
import formatDecorator from './decorators/FormatDecorator';

const DecoratorsConfig = () => {
  const [streams, setStreams] = useState<Array<Stream> | undefined>();
  const [currentStream, setCurrentStream] = useState(DEFAULT_STREAM_ID);
  const [decorators, setDecorators] = useState<Array<Decorator> | undefined>();
  const [types, setTypes] = useState();
  const [showConfigModal, setShowConfigModal] = useState(false);

  useEffect(() => { StreamsActions.listStreams().then(setStreams); }, [setStreams]);
  useEffect(() => { DecoratorsActions.available().then(setTypes); }, [setTypes]);
  useEffect(() => { DecoratorsActions.list().then(setDecorators); }, [setDecorators]);

  const openModal = () => setShowConfigModal(true);
  const closeModal = () => setShowConfigModal(false);

  if (!streams || !decorators || !types) {
    return <Spinner />;
  }

  const onSave = (newDecorators) => DecoratorsUpdater(newDecorators, decorators)
    .then(
      () => UserNotification.success('Updated decorators configuration.', 'Success!'),
      (error) => UserNotification.error(`Unable to save new decorators: ${error}`, 'Saving decorators failed'),
    )
    .then(DecoratorsActions.list)
    .then(setDecorators)
    .then(closeModal);

  const decoratorsGroupedByStream = groupBy(decorators, (decorator) => (decorator.stream || DEFAULT_SEARCH_ID));

  const currentDecorators = decoratorsGroupedByStream[currentStream] || [];
  const sortedDecorators = currentDecorators
    .sort((d1, d2) => d1.order - d2.order);
  const readOnlyDecoratorItems = sortedDecorators.map((decorator) => formatDecorator(decorator, currentDecorators, types));

  const streamOptions = streams.filter(({ id }) => Object.keys(decoratorsGroupedByStream).includes(id));

  return (
    <div>
      <h2>Decorators Configuration</h2>
      <p>Select the stream for which you want to see the set of default decorators.</p>
      <StreamSelect streams={streamOptions} onChange={setCurrentStream} value={currentStream} />
      <DecoratorList decorators={readOnlyDecoratorItems} disableDragging />
      <IfPermitted permissions="decorators:edit">
        <Button bsStyle="info" bsSize="xs" onClick={openModal}>Edit configuration</Button>
      </IfPermitted>
      <DecoratorsConfigUpdate show={showConfigModal}
                              streams={streams}
                              decorators={decorators}
                              onCancel={closeModal}
                              onSave={onSave}
                              types={types} />
    </div>
  );
};

DecoratorsConfig.propTypes = {};

export default DecoratorsConfig;
