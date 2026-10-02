"""Despliega el backend completo del TMS en el SANDBOX de AWS (cuenta 758837481569, us-east-2).

Proceso de trabajo (docs/guides/despliegue-sandbox.md): se trabaja y prueba en
local; cuando el usuario lo indica, esto sube el backend al sandbox; Intelix
toma del sandbox y despliega a producción.

No necesita SAM CLI ni Docker: arma cada Lambda con sus dependencias compiladas
para Linux (pip --platform manylinux2014_x86_64, clave para bcrypt) y usa
`aws cloudformation package/deploy`, que entiende el Transform de SAM.

Pasos:
  1. Prerrequisitos del ambiente (idempotentes): secretos /dev/tms/jwt y
     /dev/tms/eflow, parámetros SSM de red y endpoint VPC de Secrets Manager.
  2. Build de la Layer tms_common y de cada Lambda en build/sandbox/.
  3. package + deploy de cada stack, en orden: common-services primero.

    python scripts/sandbox/deploy_backend.py            # todos los stacks
    python scripts/sandbox/deploy_backend.py data admin # solo esos módulos
"""

import json
import os
import re
import secrets
import shutil
import string
import subprocess
import sys
import tempfile
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
BUILD = ROOT / "build" / "sandbox"
REGION = "us-east-2"
ACCOUNT = "758837481569"
ENV = "dev"
ARTIFACTS_BUCKET = f"tms-sandbox-artifacts-{ACCOUNT}"
STACKS = ["common-services", "auth", "data", "context", "eflow", "admin", "planning", "horarios"]
# Stacks de infraestructura sin código (template en infra/<nombre>/, sin samconfig).
INFRA_STACKS = {"horarios": ROOT / "infra" / "horarios"}
# El secreto de BD del sandbox es el del rol de la app (sql/18), no el del dueño.
PARAM_OVERRIDES = {"DbSecretName": "/dev/tms/db-app"}

# Red de Aurora db-tms-olo (VPC vpc-0a8252dbb12741364, subnets privadas del grupo rds-ec2-db-subnet-group-1).
VPC_ID = "vpc-0a8252dbb12741364"
LAMBDA_SUBNETS = ["subnet-0bb5505fe97ac8064", "subnet-0f1b05bea67e94ebe", "subnet-0394ed09a2cdb0520"]
LAMBDA_SG = "sg-06b3986a1f95d2f19"  # default de la VPC: permite 5432 a Aurora y todo el tráfico interno
SSM_SUBNETS = f"/{ENV}/tms/network/subnets"
SSM_LAMBDA_SG = f"/{ENV}/tms/network/lambda-sg"
AWS_CLI = shutil.which("aws") or "aws"
PIP_PLATFORM = ["--platform", "manylinux2014_x86_64", "--python-version", "3.13",
                "--implementation", "cp", "--only-binary=:all:", "--no-compile"]
SSM_LAYER_ARN = f"/{ENV}/tms/common-layer-arn"
FIXED_MTIME = 946684800  # 2000-01-01 (zip no admite < 1980 en hora local): zips deterministas, la Layer solo cambia si cambia su código


def aws(*args: str, check: bool = True, capture: bool = True) -> subprocess.CompletedProcess:
    env = {**os.environ, "MSYS_NO_PATHCONV": "1"}
    # Sin shell: en Windows, cmd interpretaría <, > y | de los argumentos (p. ej. la regla SPA de Amplify).
    result = subprocess.run([AWS_CLI, *args, "--region", REGION], capture_output=capture, text=True, env=env)
    if check and result.returncode != 0:
        raise SystemExit(f"FALLÓ: aws {' '.join(args[:3])}…\n{(result.stderr or '').strip()[:800]}")
    return result


def step(message: str) -> None:
    print(f"\n>>> {message}", flush=True)


# --- 1. prerrequisitos ---------------------------------------------------------------

def _secret_exists(name: str) -> bool:
    return aws("secretsmanager", "describe-secret", "--secret-id", name, check=False).returncode == 0


def _create_secret(name: str, value: dict, description: str) -> None:
    handle, path = tempfile.mkstemp(suffix=".json")
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as file:
            json.dump(value, file)
        aws("secretsmanager", "create-secret", "--name", name, "--description", description,
            "--secret-string", f"file://{path}")
    finally:
        os.remove(path)


def ensure_secrets() -> None:
    step("Secretos del ambiente")
    if not _secret_exists(PARAM_OVERRIDES["DbSecretName"]):
        raise SystemExit("Falta /dev/tms/db-app: corré primero python backend/local/activar_rol_tms_app.py")
    if not _secret_exists(f"/{ENV}/tms/jwt"):
        jwt = "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(64))
        _create_secret(f"/{ENV}/tms/jwt", {"jwt_secret": jwt}, "TMS - clave de firma de sesiones (sandbox)")
        print("    /dev/tms/jwt creado")
    if not _secret_exists(f"/{ENV}/tms/eflow"):
        # EflowMode=mock en el sandbox: el valor no se usa hasta que haya red hacia EFLOW.
        _create_secret(f"/{ENV}/tms/eflow", {"cr": {}, "ve": {}}, "TMS - EFLOW por país (sandbox en modo mock)")
        print("    /dev/tms/eflow creado (placeholder, EFLOW en mock)")
    print("    OK")


def ensure_network() -> None:
    step("Red: parámetros SSM y endpoint VPC de Secrets Manager")
    for name, kind, value in ((SSM_SUBNETS, "StringList", ",".join(LAMBDA_SUBNETS)),
                              (SSM_LAMBDA_SG, "String", LAMBDA_SG)):
        current = aws("ssm", "get-parameter", "--name", name, "--query", "Parameter.Value", "--output", "text",
                      check=False)
        if current.returncode != 0 or current.stdout.strip() != value:
            aws("ssm", "put-parameter", "--name", name, "--type", kind, "--value", value, "--overwrite")
            print(f"    {name} = {value}")
    service = f"com.amazonaws.{REGION}.secretsmanager"
    found = aws("ec2", "describe-vpc-endpoints", "--filters", f"Name=vpc-id,Values={VPC_ID}",
                f"Name=service-name,Values={service}", "--query", "VpcEndpoints[?State!='deleted'].VpcEndpointId",
                "--output", "text").stdout.strip()
    if not found:
        # Sin NAT en la VPC: las Lambdas en VPC leen sus secretos por este endpoint.
        aws("ec2", "create-vpc-endpoint", "--vpc-id", VPC_ID, "--vpc-endpoint-type", "Interface",
            "--service-name", service, "--subnet-ids", *LAMBDA_SUBNETS, "--security-group-ids", LAMBDA_SG,
            "--private-dns-enabled", "--tag-specifications",
            "ResourceType=vpc-endpoint,Tags=[{Key=Project,Value=TMS},{Key=Name,Value=dev-tms-secretsmanager}]")
        print("    endpoint de Secrets Manager creado")
    print("    OK")


def ensure_bucket() -> None:
    if aws("s3api", "head-bucket", "--bucket", ARTIFACTS_BUCKET, check=False).returncode != 0:
        aws("s3api", "create-bucket", "--bucket", ARTIFACTS_BUCKET,
            "--create-bucket-configuration", f"LocationConstraint={REGION}")
        print(f"    bucket de artefactos {ARTIFACTS_BUCKET} creado")


# --- 2. build ------------------------------------------------------------------------

def pip_install(requirements: Path, target: Path) -> None:
    if requirements.exists() and requirements.read_text(encoding="utf-8").strip():
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "-r", str(requirements), "--target",
                        str(target), *PIP_PLATFORM, "--upgrade"], check=True)


def _normalize(target: Path) -> None:
    """Sin __pycache__ y con fechas fijas: mismo código → mismo zip → CloudFormation no publica versión nueva."""
    for cache in list(target.rglob("__pycache__")):
        shutil.rmtree(cache, ignore_errors=True)
    for path in target.rglob("*"):
        os.utime(path, (FIXED_MTIME, FIXED_MTIME))


def build_dir(source: Path, target: Path) -> Path:
    shutil.copytree(source, target, ignore=shutil.ignore_patterns("__pycache__", "*.pyc", "tests"))
    pip_install(source / "requirements.txt", target)
    _normalize(target)
    return target


def build_stack(stack: str) -> Path:
    """Copia el template con CodeUri/ContentUri apuntando a carpetas ya armadas."""
    stack_dir, out = BACKEND / stack, BUILD / stack
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    text = (stack_dir / "template.yaml").read_text(encoding="utf-8")

    def replace_uri(match: re.Match) -> str:
        key, rel = match.group(1), match.group(2).strip().rstrip("/")
        name = rel.replace("/", "_")
        if key == "ContentUri":  # Layer: el código va bajo python/
            layer = out / name
            build_dir(stack_dir / rel, layer / "python")
            (layer / "python" / "requirements.txt").unlink(missing_ok=True)
            _normalize(layer)
            target = layer
        else:
            target = out / name
            if not target.exists():
                build_dir(stack_dir / rel, target)
        return f"{key}: {target.as_posix()}"

    text = re.sub(r"(CodeUri|ContentUri): (\S+)", replace_uri, text)
    template = out / "template.yaml"
    template.write_text(text, encoding="utf-8")
    return template


# --- 3. deploy ------------------------------------------------------------------------

def dev_parameters(stack: str) -> tuple[str, list[str], list[str]]:
    config = tomllib.loads((BACKEND / stack / "samconfig.toml").read_text(encoding="utf-8"))
    params = config[ENV]["deploy"]["parameters"]
    overrides = dict(item.split("=", 1) for item in params.get("parameter_overrides", []))
    overrides.update({k: v for k, v in PARAM_OVERRIDES.items() if k in overrides})
    return params["stack_name"], [f"{k}={v}" for k, v in overrides.items()], params.get("tags", [])


def deploy_infra_stack(stack: str) -> None:
    step(f"Stack {stack} (infraestructura)")
    name = f"{ENV}-tms-{stack}"
    aws("cloudformation", "deploy", "--template-file", str(INFRA_STACKS[stack] / "template.yaml"), "--stack-name", name,
        "--capabilities", "CAPABILITY_IAM", "--no-fail-on-empty-changeset",
        "--tags", "Project=TMS", "Environment=DEV", f"Name={name}", capture=False)
    print(f"    {name} OK")


def deploy_stack(stack: str) -> None:
    if stack in INFRA_STACKS:
        deploy_infra_stack(stack)
        return
    step(f"Stack {stack}")
    template = build_stack(stack)
    packaged = template.with_name("packaged.yaml")
    aws("cloudformation", "package", "--template-file", str(template), "--s3-bucket", ARTIFACTS_BUCKET,
        "--s3-prefix", stack, "--output-template-file", str(packaged))
    name, overrides, tags = dev_parameters(stack)
    args = ["cloudformation", "deploy", "--template-file", str(packaged), "--stack-name", name,
            "--capabilities", "CAPABILITY_IAM", "CAPABILITY_AUTO_EXPAND", "--no-fail-on-empty-changeset"]
    if overrides:
        args += ["--parameter-overrides", *overrides]
    if tags:
        args += ["--tags", *tags]
    aws(*args, capture=False)
    print(f"    {name} OK")


def sync_layer_parameter() -> None:
    """Los módulos toman la Layer de este parámetro (el export bloqueaba publicar versiones nuevas)."""
    arn = aws("cloudformation", "describe-stacks", "--stack-name", f"{ENV}-tms-common-services", "--query",
              "Stacks[0].Outputs[?OutputKey=='CommonLayerArn'].OutputValue", "--output", "text").stdout.strip()
    current = aws("ssm", "get-parameter", "--name", SSM_LAYER_ARN, "--query", "Parameter.Value", "--output", "text",
                  check=False)
    if current.returncode != 0 or current.stdout.strip() != arn:
        aws("ssm", "put-parameter", "--name", SSM_LAYER_ARN, "--type", "String", "--value", arn, "--overwrite")
        print(f"    {SSM_LAYER_ARN} = {arn}")


def api_url() -> str:
    return aws("cloudformation", "describe-stacks", "--stack-name", f"{ENV}-tms-common-services", "--query",
               "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue", "--output", "text").stdout.strip()


def main() -> None:
    selected = sys.argv[1:] or STACKS
    unknown = [s for s in selected if s not in STACKS]
    if unknown:
        raise SystemExit(f"Stacks desconocidos: {unknown}. Válidos: {STACKS}")
    ensure_secrets()
    ensure_network()
    ensure_bucket()
    for stack in [s for s in STACKS if s in selected]:
        if stack not in ("common-services", *INFRA_STACKS):
            sync_layer_parameter()
        deploy_stack(stack)
    print(f"\nBackend del sandbox listo. API: {api_url()}")
    print("Registrá lo creado o cambiado en docs/reference/aws-inventario-tms.md (bitácora de cambios).")


if __name__ == "__main__":
    main()
