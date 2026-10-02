"""Generate a planning contract; this does not register or execute app tools."""
import json
from pathlib import Path

def obj(props):
    return {'type':'object','properties':props,'required':list(props),'additionalProperties':False}
def string(): return {'type':'string','minLength':1,'maxLength':200}
def enum(*items): return {'type':'string','enum':list(items)}
def number(lo=-65536, hi=65536): return {'type':'number','minimum':lo,'maximum':hi}
def array(item, limit=32): return {'type':'array','items':item,'minItems':1,'maxItems':limit}
def nullable(schema): return {'anyOf':[schema,{'type':'null'}]}
xy=obj({'x':number(),'y':number()})
revision={'expected_revision':string()}
handles=array(string())
tools=[]
def tool(name,stage,description,params,guards):
    tools.append({'name':name,'stage':stage,'description':description,'input_schema':obj(params),'host_checks':guards})
tool('get_context','first','Read current project and bound selection, revision, units and permitted actions.',{},['No implicit creation or mutation.','Return compact context, not the whole project.'])
tool('read_glyphs','first','Read explicit glyph IDs and return actual metrics, revision-scoped handles and optional geometry.',{'glyph_ids':handles,'detail':enum('metrics','geometry'),'cursor':nullable(string())},['Page geometry output; hard byte/point limits.','Absent glyph returns not_found, never creates a glyph.'])
tool('set_spacing','first','Set one spacing measurement per glyph in font units.',{**revision,'changes':array(obj({'glyph_id':string(),'measurement':enum('left_bearing','right_bearing','advance_width'),'value':number()}))},['Honor request scope and locks; reject duplicate glyph IDs.','LSB shifts outline and advance together, RSB changes advance only.','Reject invalid advance; validate project-relative engineering limits.','Commit batch atomically with one history entry.'])
tool('transform_paths','next','Transform explicit revision-scoped paths using a typed operation and explicit origin.',{**revision,'path_handles':handles,'transform':{'anyOf':[
    obj({'operation':enum('translate'),'delta':xy}),
    obj({'operation':enum('scale'),'factor_x':number(0.01,100),'factor_y':number(0.01,100),'origin':xy}),
    obj({'operation':enum('rotate'),'angle_degrees':number(-360,360),'origin':xy}),
    obj({'operation':enum('skew'),'angle_degrees':number(-80,80),'origin':xy}),
    obj({'operation':enum('flip_horizontal','flip_vertical'),'origin':xy})
]}},['Enforce path/point locks.','Convert degree/radian conventions and preserve explicit origin.','Reject component transforms until supported; never silently skip instances.'])
tool('edit_points','next','Set explicit anchor or handle coordinates.',{**revision,'changes':array(obj({'point_handle':string(),'part':enum('anchor','handle_1','handle_2'),'position':xy,'point_type':enum('corner','flat','symmetric')}),128)},['Resolve handles only at matching revision.','Respect locks and handle constraints; anchor moves translate its handles.'])
tool('create_glyph','next','Create an empty glyph for one Unicode scalar.',{**revision,'unicode_scalar':{'type':'integer','minimum':0,'maximum':1114111},'advance_width':number(0,65536)},['Reject surrogate code points and existing glyphs.','New glyph must be in requested character set; never overwrite.'])
point=obj({'anchor':xy,'handle_1':xy,'handle_2':xy,'point_type':enum('corner','flat','symmetric')})
tool('add_paths','next','Add bounded closed cubic paths to an explicit glyph.',{**revision,'glyph_id':string(),'paths':array(obj({'points':array(point,128)}),16)},['Reject non-finite, excessive or degenerate geometry.','Validate contour closure and report intersections/winding concerns.','Host generates path/point handles; input cannot choose object properties.'])
tool('set_kerning','later','Set one exact pair adjustment in font units.',{**revision,'left_glyph_id':string(),'right_glyph_id':string(),'adjustment':number()},['Negative tightens.','Detect overlap with existing groups; no silent group precedence changes.'])
tool('place_component','later','Insert an existing reusable glyph/component at a translation.',{**revision,'target_glyph_id':string(),'source_id':string(),'translation':xy},['Reject cycles and unauthorized dependent effects.','Maintain usedIn and invalidate dependent bounds/caches.','Limit first implementation to translation; do not guess resize delta semantics.'])
tool('set_font_properties','later','Set explicit naming/export metadata; never imply geometry has changed.',{**revision,'family_name':nullable(string()),'style_name':nullable(string()),'weight_class':nullable({'type':'integer','minimum':1,'maximum':1000}),'width_class':nullable({'type':'integer','minimum':1,'maximum':9}),'italic_angle':nullable(number(-90,90))},['Null means unchanged; at least one actual change required.','Validate naming/export conventions; preserve copyright/license unless explicitly requested through a separate policy.','Weight and italic metadata do not transform outlines.'])
tool('inspect_font','later','Return bounded structural findings for requested glyphs.',{'glyph_ids':handles,'checks':array(enum('geometry','spacing','components','coverage'),4)},['Read only; separate warnings from errors.','No claim of complete typographic quality or export validity without actual checks.'])
data={'contract_version':2,'status':'proposal_only_not_executable','model_tools':tools,'host_context':['project_id','authorized_target_ids','request_id','idempotency_key','cancellation','permission_state'],'execution_rules':['Deny unknown tools and unknown fields.','Schema limits are proposed resource limits, not OpenType limits; validate against project policy too.','All writes use compare-and-swap revision checks, deep rollback snapshots, atomic history and existing refresh events.','No model-visible eval, shell, browser automation, generic patch, arbitrary file IO or permission escalation.','Stop cancels pending work; committed edits remain in normal history.'],'result_contract':{'success':['new_revision','affected_ids','measured_changes','warnings','history_entry_id'],'failure':['code','message','retryable','current_revision'],'failure_codes':['invalid_arguments','not_found','out_of_scope','locked','stale_revision','dependency_conflict','invalid_geometry','cancelled','limit_exceeded']}}
Path(__file__).with_name('tool-catalog.json').write_text(json.dumps(data,indent=2)+'\n')
print(f'{len(tools)} planned tools; first slice: get_context, read_glyphs, set_spacing')
