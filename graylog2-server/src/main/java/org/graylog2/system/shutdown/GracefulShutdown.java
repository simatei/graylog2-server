/*
 * Copyright 2012-2014 TORCH GmbH
 *
 * This file is part of Graylog2.
 *
 * Graylog2 is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Graylog2 is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Graylog2.  If not, see <http://www.gnu.org/licenses/>.
 */

package org.graylog2.system.shutdown;

import com.google.common.base.Stopwatch;
import com.google.inject.Inject;
import org.graylog2.Configuration;
import org.graylog2.buffers.Buffers;
import org.graylog2.caches.Caches;
import org.graylog2.indexer.Indexer;
import org.graylog2.periodical.Periodical;
import org.graylog2.periodical.Periodicals;
import org.graylog2.plugin.inputs.InputState;
import org.graylog2.plugin.inputs.MessageInput;
import org.graylog2.plugin.lifecycles.Lifecycle;
import org.graylog2.shared.ProcessingPauseLockedException;
import org.graylog2.shared.ServerStatus;
import org.graylog2.shared.inputs.InputRegistry;
import org.graylog2.system.activities.Activity;
import org.graylog2.system.activities.ActivityWriter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/**
 * @author Lennart Koopmann <lennart@torch.sh>
 */
public class GracefulShutdown implements Runnable {

    private static final Logger LOG = LoggerFactory.getLogger(GracefulShutdown.class);

    public final int SLEEP_SECS = 1;

    private final Configuration configuration;
    private final Buffers bufferSynchronizer;
    private final Caches cacheSynchronizer;
    private final Indexer indexer;
    private final Periodicals periodicals;
    private final InputRegistry inputs;
    private final ServerStatus serverStatus;
    private final ActivityWriter activityWriter;

    @Inject
    public GracefulShutdown(ServerStatus serverStatus,
                            ActivityWriter activityWriter,
                            Configuration configuration,
                            Buffers bufferSynchronizer,
                            Caches cacheSynchronizer,
                            Indexer indexer,
                            Periodicals periodicals,
                            InputRegistry inputs) {
        this.serverStatus = serverStatus;
        this.activityWriter = activityWriter;
        this.configuration = configuration;
        this.bufferSynchronizer = bufferSynchronizer;
        this.cacheSynchronizer = cacheSynchronizer;
        this.indexer = indexer;
        this.periodicals = periodicals;
        this.inputs = inputs;
    }

    @Override
    public void run() {
        LOG.info("Graceful shutdown initiated.");
        serverStatus.setLifecycle(Lifecycle.HALTING);

        // Give possible load balancers time to recognize state change. State is DEAD because of HALTING.
        LOG.info("Node status: [{}]. Waiting <{}sec> for possible load balancers to recognize state change.",
                serverStatus.getLifecycle().toString(),
                configuration.getLoadBalancerRecognitionPeriodSeconds());
        try {
            Thread.sleep(configuration.getLoadBalancerRecognitionPeriodSeconds()*1000);
        } catch (InterruptedException ignored) { /* nope */ }

        activityWriter.write(
                new Activity("Graceful shutdown initiated.", GracefulShutdown.class)
        );

        /*
         * Wait a second to give for example the calling REST call some time to respond
         * to the client. Using a latch or something here might be a bit over-engineered.
         */
        try {
            Thread.sleep(SLEEP_SECS*1000);
        } catch (InterruptedException ignored) { /* nope */ }

        // Stop all inputs.
        stopInputs();

        // Make sure that message processing is enabled. We need it enabled to work on buffered/cached messages.
        serverStatus.unlockProcessingPause();
        try {
            serverStatus.resumeMessageProcessing();
            serverStatus.setLifecycle(Lifecycle.HALTING); // Was overwritten with RUNNING when resuming message processing,
        } catch (ProcessingPauseLockedException e) {
            throw new RuntimeException("Seems like unlocking the processing pause did not succeed.", e);
        }

        // Wait for empty master caches.
        cacheSynchronizer.waitForEmptyCaches();

        // Wait for buffers.
        bufferSynchronizer.waitForEmptyBuffers();

        // Stop all threads that should be stopped.
        shutdownPeriodicals();

        // Properly close ElasticSearch node.
        indexer.getNode().close();

        // Shut down hard with no shutdown hooks running.
        LOG.info("Goodbye.");
        Runtime.getRuntime().halt(0);
    }

    private void shutdownPeriodicals() {
        for (Periodical periodical : periodicals.getAllStoppedOnGracefulShutdown()) {
            LOG.info("Shutting down periodical [{}].", periodical.getClass().getCanonicalName());
            Stopwatch s = new Stopwatch().start();

            // Cancel future executions.
            Map<Periodical,ScheduledFuture> futures = periodicals.getFutures();
            if (futures.containsKey(periodical)) {
                futures.get(periodical).cancel(false);

                s.stop();
                LOG.info("Shutdown of periodical [{}] complete, took <{}ms>.",
                        periodical.getClass().getCanonicalName(), s.elapsed(TimeUnit.MILLISECONDS));
            } else {
                LOG.error("Could not find periodical [{}] in futures list. Not stopping execution.",
                        periodical.getClass().getCanonicalName());
            }
        }
    }

    private void stopInputs() {
        for (InputState state : inputs.getRunningInputs()) {
            MessageInput input = state.getMessageInput();

            LOG.info("Attempting to close input <{}> [{}].", input.getUniqueReadableId(), input.getName());

            Stopwatch s = new Stopwatch().start();
            input.stop();
            s.stop();

            LOG.info("Input [{}] closed. Took [{}ms]", input.getUniqueReadableId(), s.elapsed(TimeUnit.MILLISECONDS));
        }
    }

}
