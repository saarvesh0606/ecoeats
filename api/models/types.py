"""Shared column types."""

from enum import StrEnum

from sqlalchemy import Enum


def enum_column(enum_cls: type[StrEnum], *, name: str) -> Enum:
    """A VARCHAR column constrained to an enum's *values*.

    Two non-default choices, both deliberate:

    ``values_callable``
        SQLAlchemy persists the enum member *name* by default — ``PENDING``,
        not ``pending``. That leaks Python naming into the database, breaks any
        hand-written SQL that compares against the documented value, and
        disagrees with what the API serialises. We store values.

    ``create_constraint``
        Off by default in SQLAlchemy 2.0, meaning the column would accept any
        string that fits. On, PostgreSQL rejects an unknown status outright.
    """
    return Enum(
        enum_cls,
        name=name,
        native_enum=False,
        create_constraint=True,
        validate_strings=True,
        values_callable=lambda members: [member.value for member in members],
        length=20,
    )
