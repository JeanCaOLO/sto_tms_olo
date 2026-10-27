"""El template SAM debe ser YAML válido (un `: ` sin comillas en una Description rompe el deploy)."""

from pathlib import Path

import pytest

yaml = pytest.importorskip("yaml")

TEMPLATE = Path(__file__).resolve().parent.parent / "template.yaml"


class _CfnLoader(yaml.SafeLoader):
    pass


# Las etiquetas de CloudFormation (!Ref, !Sub, !GetAtt...) no importan para validar la sintaxis.
_CfnLoader.add_multi_constructor("!", lambda loader, suffix, node: None)


def test_template_is_valid_yaml_with_cost_settings():
    template = yaml.load(TEMPLATE.read_text(encoding="utf-8"), Loader=_CfnLoader)
    function = template["Resources"]["MobileApiFunction"]["Properties"]
    assert function["Architectures"] == ["arm64"]
    assert function["Timeout"] == 20
    assert {"MemorySize", "MaxConcurrency"} <= set(template["Parameters"])


def test_template_points_the_db_ssl_ca_to_a_bundled_certificate():
    template = yaml.load(TEMPLATE.read_text(encoding="utf-8"), Loader=_CfnLoader)
    env = template["Resources"]["MobileApiFunction"]["Properties"]["Environment"]["Variables"]
    assert env["DB_SSL_CA"] == "/var/task/certs/rds-global-bundle.pem"
    assert (TEMPLATE.parent / "src" / "certs" / "rds-global-bundle.pem").exists()   # CodeUri: src/ lo empaqueta
