import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from cofacts_ai.session_title import generate_session_title


class GenerateSessionTitleTest(unittest.IsolatedAsyncioTestCase):
    async def test_first_turn_sets_normalized_title(self):
        generate_content = AsyncMock(
            return_value=SimpleNamespace(text=' "台電停電查證"\n ')
        )
        client = _client(generate_content)
        context = _context(
            [
                _event("user", "請查證台電停電傳言"),
                _event("writer", "這則訊息需要比對台電公告。"),
            ],
            user_text="請查證台電停電傳言",
            title="請查證台電停電傳言",
        )

        with patch("cofacts_ai.session_title._get_client", return_value=client):
            await generate_session_title(context)

        self.assertEqual(context.state["title"], "台電停電查證")
        generate_content.assert_awaited_once()

    async def test_second_turn_does_not_call_llm(self):
        context = _context(
            [
                _event("user", "第一則訊息"),
                _event("writer", "第一回覆"),
                _event("user", "第二則訊息"),
            ],
            user_text="第二則訊息",
            title="使用者改過的標題",
        )

        with patch("cofacts_ai.session_title._get_client") as get_client:
            await generate_session_title(context)

        self.assertEqual(context.state["title"], "使用者改過的標題")
        get_client.assert_not_called()

    async def test_llm_error_leaves_title_unchanged(self):
        generate_content = AsyncMock(side_effect=RuntimeError("boom"))
        client = _client(generate_content)
        context = _context(
            [
                _event("user", "請查證"),
                _event("writer", "查證結果"),
            ],
            user_text="請查證",
            title="請查證",
        )

        with (
            patch("cofacts_ai.session_title._get_client", return_value=client),
            patch("cofacts_ai.session_title.logger.exception") as log_error,
        ):
            await generate_session_title(context)

        self.assertEqual(context.state["title"], "請查證")
        log_error.assert_called_once()

    async def test_whitespace_title_is_not_written(self):
        generate_content = AsyncMock(return_value=SimpleNamespace(text="\n  \t"))
        client = _client(generate_content)
        context = _context(
            [
                _event("user", "請查證"),
                _event("writer", "查證結果"),
            ],
            user_text="請查證",
            title="請查證",
        )

        with patch("cofacts_ai.session_title._get_client", return_value=client):
            await generate_session_title(context)

        self.assertEqual(context.state["title"], "請查證")


def _context(events, user_text="", title="placeholder"):
    return SimpleNamespace(
        session=SimpleNamespace(events=events),
        user_content=_content(user_text),
        state={"title": title},
    )


def _event(author, text):
    return SimpleNamespace(author=author, content=_content(text))


def _content(text):
    return SimpleNamespace(
        parts=[SimpleNamespace(text=text, thought=False)] if text else []
    )


def _client(generate_content):
    return SimpleNamespace(
        aio=SimpleNamespace(
            models=SimpleNamespace(generate_content=generate_content),
        )
    )


if __name__ == "__main__":
    unittest.main()
