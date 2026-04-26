import os
import logging
from openinference.instrumentation.google_adk import GoogleADKInstrumentor
from langfuse import get_client
from google.adk.plugins.base_plugin import BasePlugin
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events.event import Event

logger = logging.getLogger(__name__)

def setup_instrumentation():
    """
    Sets up Langfuse instrumentation for Google ADK.
    """
    if not (os.getenv("LANGFUSE_PUBLIC_KEY") and os.getenv("LANGFUSE_SECRET_KEY")):
        logger.warning("Langfuse credentials not found. Skipping instrumentation.")
        return

    langfuse = get_client()

    if langfuse.auth_check():
        GoogleADKInstrumentor().instrument()
        logger.info("Langfuse instrumentation initialized.")
    else:
        logger.warning("Langfuse authentication failed. Skipping instrumentation.")


class LangfuseTracingPlugin(BasePlugin):
    """
    ADK Plugin that stamps each emitted event with the current Langfuse
    trace ID in custom_metadata.

    We use `before_run_callback` and `run_config.custom_metadata` because:
    1. ADK's `Runner` merges `run_config.custom_metadata` into every event
       generated during the invocation.
    2. This merging happens *before* the event is persisted to the session
       store.
    3. Using `on_event_callback` would be too late for persistence, as ADK
       saves the event to the database before the plugin's `on_event` is called.
    """

    def __init__(self):
        super().__init__(name="langfuse_tracing")

    async def before_run_callback(
        self, *, invocation_context: InvocationContext
    ):
        langfuse = get_client()
        trace_id = langfuse.get_current_trace_id()
        if trace_id:
            # Set the trace ID in run_config so ADK automatically stamps all
            # future events in this invocation before they are saved to the DB.
            if invocation_context.run_config.custom_metadata is None:
                invocation_context.run_config.custom_metadata = {}
            invocation_context.run_config.custom_metadata["langfuse_trace_id"] = trace_id
        return None
