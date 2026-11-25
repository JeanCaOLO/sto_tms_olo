"""Contratos locales de evidencias; no consulta ni modifica AWS."""
from pathlib import Path
import tomllib
import unittest

import yaml


ROOT = Path(__file__).resolve().parents[2]


class CloudFormationLoader(yaml.SafeLoader):
    pass


def intrinsic(loader, tag, node):
    value = (loader.construct_scalar(node) if isinstance(node, yaml.ScalarNode)
             else loader.construct_sequence(node) if isinstance(node, yaml.SequenceNode)
             else loader.construct_mapping(node))
    return {tag if tag == 'Ref' else f'Fn::{tag}': value}


CloudFormationLoader.add_multi_constructor('!', intrinsic)


def template(stack):
    return yaml.load((ROOT / 'backend' / stack / 'template.yaml').read_text(encoding='utf-8'),
                     Loader=CloudFormationLoader)


def dev_parameters(stack):
    config = tomllib.loads((ROOT / 'backend' / stack / 'samconfig.toml').read_text(encoding='utf-8'))
    return dict(item.split('=', 1) for item in config['dev']['deploy']['parameters']['parameter_overrides'])


class ReturnEvidenceInfrastructure(unittest.TestCase):
    def test_admin_has_dedicated_role_without_changing_maintenance_role(self):
        resources = template('admin')['Resources']
        self.assertEqual(resources['AdminApiFunction']['Properties']['Role'], {'Fn::GetAtt': 'AdminApiRole.Arn'})
        self.assertIn('Fn::ImportValue', resources['AuditMaintenanceFunction']['Properties']['Role'])
        role = resources['AdminApiRole']['Properties']
        self.assertEqual(role['AssumeRolePolicyDocument']['Statement'][0]['Principal'], {'Service': 'lambda.amazonaws.com'})
        policies = [policy.get('Fn::If', [None, policy])[1] for policy in role['Policies']]
        statements = [s for policy in policies for s in policy['PolicyDocument']['Statement']]
        evidence = [s for s in statements if s.get('Sid', '').startswith('Evidence')]
        self.assertEqual(len(evidence), 2)
        self.assertEqual(evidence[0]['Action'], ['s3:GetObject'])
        self.assertEqual(evidence[0]['Resource'], {'Fn::Sub': 'arn:${AWS::Partition}:s3:::${MobileEvidenceBucket}/pedidos/*'})
        self.assertEqual(evidence[1]['Action'], ['s3:GetObject', 's3:PutObject'])
        self.assertEqual(evidence[1]['Resource'], {'Fn::Sub': 'arn:${AWS::Partition}:s3:::${MobileEvidenceBucket}/solicitudes/*'})
        self.assertEqual(role['Policies'][1]['Fn::If'][0], 'HasEvidenceBucket')
        self.assertEqual(role['Policies'][1]['Fn::If'][2], {'Ref': 'AWS::NoValue'})
        self.assertEqual([s['Action'] for s in statements if s.get('Sid') == 'ReadDatabaseSecret'], ['secretsmanager:GetSecretValue'])
        shared = str(template('common-services')['Resources']['TmsApiLambdaRole'])
        self.assertNotIn('s3:', shared)

    def test_dev_bucket_and_cors_are_explicit_without_changing_other_environments(self):
        self.assertEqual(dev_parameters('admin')['MobileEvidenceBucket'], 'dev-tms-mobile-evidencias-758837481569')
        origins = set(dev_parameters('mobile')['EvidenceCorsOrigins'].split(','))
        self.assertEqual(origins, {'http://localhost:8081', 'http://localhost:3000',
            'https://sandbox.d1q6tzcx0ew3rk.amplifyapp.com',
            'https://sandbox.d1q6tzcx0ew3rk.amplifyapp.com.'})
        mobile = template('mobile')
        self.assertEqual(mobile['Parameters']['EvidenceCorsOrigins']['Default'], 'http://localhost:8081,http://localhost:3000')
        bucket = mobile['Resources']['EvidenceBucket']
        self.assertTrue(all(bucket['Properties']['PublicAccessBlockConfiguration'].values()))
        self.assertEqual(bucket['DeletionPolicy'], 'Retain')
        self.assertEqual(bucket['Properties']['CorsConfiguration']['CorsRules'][0]['AllowedOrigins'], {'Ref': 'EvidenceCorsOrigins'})


if __name__ == '__main__':
    unittest.main()
