from __future__ import annotations

import os
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


APP_TIMEZONE_NAME = os.getenv("APP_TIMEZONE", "Europe/London")

try:
    APP_TIMEZONE = ZoneInfo(APP_TIMEZONE_NAME)
except ZoneInfoNotFoundError:
    APP_TIMEZONE = ZoneInfo("UTC")


def local_date(value: datetime):
    if value.tzinfo is None:
        value = value.replace(tzinfo=ZoneInfo("UTC"))
    return value.astimezone(APP_TIMEZONE).date()
