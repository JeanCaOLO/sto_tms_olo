"""Parser del mini-lenguaje `select` estilo PostgREST/Supabase.

    "*, role:roles(id, name)" -> [SelectNode('*'), SelectNode('roles', alias='role', children=[...])]

Portado de parseSelect en server/tms-select.mjs.
"""

import re
from dataclasses import dataclass, field

from tms_common.errors import HttpError

IDENT_CHAR = re.compile(r"[A-Za-z0-9_*]")


@dataclass
class SelectNode:
    name: str
    alias: str
    children: list["SelectNode"] | None = field(default=None)

    @property
    def is_star(self) -> bool:
        return self.name == "*"


STAR = SelectNode(name="*", alias="*")


class _Parser:
    def __init__(self, text: str):
        self.text = re.sub(r"\s+", "", text or "*")
        self.pos = 0

    def peek(self) -> str:
        return self.text[self.pos] if self.pos < len(self.text) else ""

    def ident(self) -> str:
        start = self.pos
        while self.pos < len(self.text) and IDENT_CHAR.match(self.text[self.pos]):
            self.pos += 1
        if start == self.pos:
            raise HttpError(400, f'select mal formado cerca de la posición {self.pos}: "{self.text}"')
        return self.text[start:self.pos]

    def item(self) -> SelectNode:
        name = self.ident()
        alias = name
        if self.peek() == ":":
            self.pos += 1
            name = self.ident()
        children = None
        if self.peek() == "(":
            self.pos += 1
            children = self.items()
            if self.peek() != ")":
                raise HttpError(400, f'select mal formado: falta ")" en "{self.text}"')
            self.pos += 1
        return SelectNode(name=name, alias=alias, children=children)

    def items(self) -> list[SelectNode]:
        nodes = [self.item()]
        while self.peek() == ",":
            self.pos += 1
            nodes.append(self.item())
        return nodes


def parse_select(text: str | None) -> list[SelectNode]:
    parser = _Parser(text or "*")
    nodes = parser.items()
    if parser.pos != len(parser.text):
        raise HttpError(400, f'select mal formado, sobra "{parser.text[parser.pos:]}"')
    return nodes
