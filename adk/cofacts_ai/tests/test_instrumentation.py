"""Unit tests for `TextExtractionSpanProcessor` and `_parts_text`.

The processor rewrites input.value/output.value from serialized JSON to plain
text at span end (#14). Every test drives a real SDK TracerProvider with an
InMemorySpanExporter and asserts on the EXPORTED span: on_end only receives a
ReadableSpan snapshot, so proving the rewrite survives to export is the whole
point -- a set_attribute-based implementation raises AttributeError there.
"""

import json
from collections.abc import Mapping
from typing import Any

from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import (
    InMemorySpanExporter,
)

from cofacts_ai.instrumentation import TextExtractionSpanProcessor, _parts_text

JSON_MIME = "application/json"

INVOCATION_INPUT = json.dumps(
    {
        "user_id": "u1",
        "session_id": "s1",
        "new_message": {"role": "user", "parts": [{"text": "請查證這則訊息"}]},
    },
    ensure_ascii=False,
)

FINAL_EVENT_OUTPUT = json.dumps(
    {
        "content": {"role": "model", "parts": [{"text": "查證結果如下"}]},
        "author": "writer",
        "id": "ev-1",
    },
    ensure_ascii=False,
)


def run_span(attributes: dict) -> Mapping[str, Any]:
    """Ends one span carrying `attributes`; returns the EXPORTED attributes."""
    provider = TracerProvider()
    exporter = InMemorySpanExporter()
    provider.add_span_processor(TextExtractionSpanProcessor())
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    tracer = provider.get_tracer("test")
    with tracer.start_as_current_span("span", attributes=attributes):
        pass
    (span,) = exporter.get_finished_spans()
    assert span.attributes is not None
    return span.attributes


class TestTextExtractionSpanProcessor:
    def test_input_value_rewritten_to_plain_text(self):
        attrs = run_span(
            {"input.value": INVOCATION_INPUT, "input.mime_type": JSON_MIME}
        )
        assert attrs["input.value"] == "請查證這則訊息"
        assert attrs["input.mime_type"] == "text/plain"

    def test_output_value_rewritten_from_final_event(self):
        attrs = run_span(
            {"output.value": FINAL_EVENT_OUTPUT, "output.mime_type": JSON_MIME}
        )
        assert attrs["output.value"] == "查證結果如下"
        assert attrs["output.mime_type"] == "text/plain"

    def test_non_json_value_untouched(self):
        attrs = run_span({"input.value": "not json", "input.mime_type": JSON_MIME})
        assert attrs["input.value"] == "not json"
        assert attrs["input.mime_type"] == JSON_MIME

    def test_json_without_parts_untouched(self):
        payload = json.dumps({"error": "timeout", "message": "tool failed"})
        attrs = run_span({"output.value": payload, "output.mime_type": JSON_MIME})
        assert attrs["output.value"] == payload
        assert attrs["output.mime_type"] == JSON_MIME

    def test_span_without_input_output_is_ignored(self):
        attrs = run_span({"session.id": "s1"})
        assert attrs["session.id"] == "s1"


class TestPartsText:
    def test_joins_multiple_text_parts(self):
        data = {"content": {"parts": [{"text": "第一段"}, {"text": "第二段"}]}}
        assert _parts_text(data) == "第一段\n第二段"

    def test_skips_thought_parts(self):
        data = {
            "content": {
                "parts": [{"text": "內部思考", "thought": True}, {"text": "回覆"}]
            }
        }
        assert _parts_text(data) == "回覆"

    def test_image_only_parts_yield_none(self):
        data = {
            "new_message": {
                "parts": [{"inline_data": {"mime_type": "image/webp", "data": "…"}}]
            }
        }
        assert _parts_text(data) is None

    def test_prefers_new_message_over_missing_content(self):
        data = {"new_message": {"parts": [{"text": "使用者輸入"}]}}
        assert _parts_text(data) == "使用者輸入"
