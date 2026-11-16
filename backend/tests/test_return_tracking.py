"""El seguimiento usa hechos aceptados y compara saldos por línea, sin mezclar presentaciones."""
import pytest
from conftest import load_stack_module


@pytest.mark.parametrize('delivery,issue,items,expected',[
    (None,None,[],'legacy'),('pending',None,[],'pending_send'),('leased',None,[],'awaiting_ack'),
    ('failed',None,[],'delivery_failed'),('acknowledged',None,[],'planning'),
    ('acknowledged','planning.no_candidate',[],'no_candidate'),
    ('acknowledged','planning.failed',[],'planning_failed'),
    ('acknowledged',None,[{'requested':5,'assigned':5,'collected':0,'delivered':0}],'tracking'),
    ('acknowledged','planning.no_candidate',[{'requested':5,'assigned':0,'collected':3,'delivered':0}],'tracking'),
    ('acknowledged',None,[{'requested':5,'assigned':0,'collected':3,'delivered':3}],'partially_delivered'),
    ('acknowledged',None,[{'requested':5,'assigned':0,'collected':5,'delivered':5}],'delivered'),
])
def test_status(delivery,issue,items,expected):
    module=load_stack_module('admin','admin_return_tracking')
    assert module.status({'delivery_status':delivery,'planning_issue':issue,'item_progress':items})==expected


def test_more_delivered_of_one_item_never_completes_other_presentation():
    module=load_stack_module('admin','admin_return_tracking')
    assert module.status({'delivery_status':'acknowledged','item_progress':[
        {'requested':1,'assigned':0,'collected':2,'delivered':2},
        {'requested':1,'assigned':0,'collected':0,'delivered':0},
    ]})=='partially_delivered'
