"""Estados operativos directos: solo hechos de BD, nunca leases o acuses."""
import pytest
from conftest import load_stack_module


@pytest.mark.parametrize('version,complete,issue,items,tracking,expected',[
 (None,False,None,[],[],'legacy'),
 (2,False,None,[],[],'needs_data'),
 (2,True,None,[],[],'pending_planning'),
 (2,True,'planning.no_candidate',[],[],'no_candidate'),
 (2,True,'planning.failed',[],[],'planning_failed'),
 (2,True,None,[{'requested':5,'assigned':5,'collected':0,'delivered':0}],[],'scheduled'),
 (2,True,None,[{'requested':5,'assigned':5,'collected':0,'delivered':0}],[{'route_id':'r','allocation_state':'executing'}],'tracking'),
 (2,True,'planning.no_candidate',[{'requested':5,'assigned':0,'collected':3,'delivered':0}],[],'tracking'),
 (2,True,None,[{'requested':5,'assigned':0,'collected':3,'delivered':3}],[],'partially_delivered'),
 (2,True,None,[{'requested':5,'assigned':0,'collected':5,'delivered':5}],[],'delivered'),
])
def test_status(version,complete,issue,items,tracking,expected):
    module=load_stack_module('admin','admin_return_tracking')
    assert module.status({'collection_contract_version':version,'origin':{'planning':{'capacity_complete':complete}},
                          'planning_issue':issue,'item_progress':items,'tracking':tracking})==expected


def test_more_delivered_of_one_item_never_completes_other_presentation():
    module=load_stack_module('admin','admin_return_tracking')
    assert module.status({'collection_contract_version':2,'item_progress':[
        {'requested':1,'assigned':0,'collected':2,'delivered':2},
        {'requested':1,'assigned':0,'collected':0,'delivered':0},
    ]})=='partially_delivered'


def test_replanned_balance_is_scheduled_even_with_closed_historical_route():
    module=load_stack_module('admin','admin_return_tracking')
    row={'collection_contract_version':2,'origin':{'planning':{'capacity_complete':True}},
         'item_progress':[{'requested':10,'assigned':10,'collected':0,'delivered':0}],
         'tracking':[{'route_id':'old-route','allocation_state':'pickup_closed'},
                     {'route_id':None,'allocation_state':'planned'}]}
    assert module.status(row)=='scheduled'
