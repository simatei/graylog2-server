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
import PropTypes from 'prop-types';
import lodash from 'lodash';

import history from 'util/History';
import Routes from 'routing/Routes';
import connect from 'stores/connect';
import EventDefinitionPriorityEnum from 'logic/alerts/EventDefinitionPriorityEnum';
import { ConfirmLeaveDialog, Spinner } from 'components/common';
import { AvailableEventDefinitionTypesStore } from 'stores/event-definitions/AvailableEventDefinitionTypesStore';
import { ConfigurationsActions } from 'stores/configurations/ConfigurationsStore';
import { CurrentUserStore } from 'stores/users/CurrentUserStore';
import { EventDefinitionsActions } from 'stores/event-definitions/EventDefinitionsStore';
import { EventNotificationsActions, EventNotificationsStore } from 'stores/event-notifications/EventNotificationsStore';

import EventDefinitionForm from './EventDefinitionForm';

// Import built-in plugins
import 'components/event-definitions/event-definition-types';

import 'components/event-notifications/event-notification-types';

const fetchNotifications = () => {
  EventNotificationsActions.listAll();
};

const handleCancel = () => {
  history.push(Routes.ALERTS.DEFINITIONS.LIST);
};

class EventDefinitionFormContainer extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      eventDefinition: props.eventDefinition,
      validation: {
        errors: {},
      },
      eventsClusterConfig: undefined,
      isDirty: false,
    };
  }

  componentDidMount() {
    this.fetchClusterConfig();
    fetchNotifications();
  }

  fetchClusterConfig = () => {
    ConfigurationsActions.listEventsClusterConfig().then((config) => this.setState({ eventsClusterConfig: config }));
  };

  handleChange = (key, value) => {
    this.setState((state) => {
      const nextEventDefinition = lodash.cloneDeep(state.eventDefinition);

      nextEventDefinition[key] = value;
      const { onEventDefinitionChange } = this.props;

      onEventDefinitionChange(nextEventDefinition);

      return { eventDefinition: nextEventDefinition, isDirty: true };
    });
  };

  handleSubmitSuccessResponse = () => {
    this.setState({ isDirty: false }, () => history.push(Routes.ALERTS.DEFINITIONS.LIST));
  };

  handleSubmitFailureResponse = (errorResponse) => {
    const { body } = errorResponse.additional;

    if (errorResponse.status === 400) {
      if (body && body.failed) {
        this.setState({ validation: body });

        return;
      }

      if (body.type && body.type === 'ApiError') {
        if (body.message.includes('org.graylog.events.conditions.Expression')
          || body.message.includes('org.graylog.events.conditions.Expr')
          || body.message.includes('org.graylog.events.processor.aggregation.AggregationSeries')) {
          this.setState({
            validation: {
              errors: { conditions: ['Aggregation condition is not valid'] },
            },
          });

          return;
        }

        if (body.message.includes('embryonic')) {
          this.setState({
            validation: {
              errors: { query_parameters: ['Query parameters must be declared'] },
            },
          });
        }
      }
    }
  };

  handleSubmit = () => {
    const { action } = this.props;
    const { eventDefinition } = this.state;

    if (action === 'create') {
      EventDefinitionsActions.create(eventDefinition)
        .then(this.handleSubmitSuccessResponse, this.handleSubmitFailureResponse);
    } else {
      EventDefinitionsActions.update(eventDefinition.id, eventDefinition)
        .then(this.handleSubmitSuccessResponse, this.handleSubmitFailureResponse);
    }
  };

  render() {
    const { action, entityTypes, notifications, currentUser } = this.props;
    const { isDirty, eventDefinition, eventsClusterConfig, validation } = this.state;
    const isLoading = !entityTypes || !notifications.all || !eventsClusterConfig;

    if (isLoading) {
      return <Spinner text="Loading Event information..." />;
    }

    const defaults = { default_backlog_size: eventsClusterConfig.events_notification_default_backlog };

    return (
      <>
        {isDirty && (
          <ConfirmLeaveDialog question="Do you really want to abandon this page and lose your changes? This action cannot be undone." />
        )}
        <EventDefinitionForm action={action}
                             eventDefinition={eventDefinition}
                             currentUser={currentUser}
                             validation={validation}
                             entityTypes={entityTypes}
                             notifications={notifications.all}
                             defaults={defaults}
                             onChange={this.handleChange}
                             onCancel={handleCancel}
                             onSubmit={this.handleSubmit} />
      </>
    );
  }
}

EventDefinitionFormContainer.propTypes = {
  action: PropTypes.oneOf(['create', 'edit']),
  eventDefinition: PropTypes.object,
  currentUser: PropTypes.object.isRequired,
  entityTypes: PropTypes.object,
  notifications: PropTypes.object.isRequired,
  onEventDefinitionChange: PropTypes.func,
};

EventDefinitionFormContainer.defaultProps = {
  action: 'edit',
  eventDefinition: {
    title: '',
    description: '',
    priority: EventDefinitionPriorityEnum.NORMAL,
    config: {},
    field_spec: {},
    key_spec: [],
    notification_settings: {
      grace_period_ms: 300000,
      // Defaults to system setting for notification backlog size
      backlog_size: null,
    },
    notifications: [],
    alert: false,
  },
  entityTypes: undefined,
  onEventDefinitionChange: () => {},
};

export default connect(EventDefinitionFormContainer, {
  entityTypes: AvailableEventDefinitionTypesStore,
  notifications: EventNotificationsStore,
  currentUser: CurrentUserStore,
}, ({ currentUser, ...otherProps }) => ({
  ...otherProps,
  currentUser: currentUser.currentUser,
}));
