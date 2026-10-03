-- Keep immutable historical profiles and their assignments; extend named role types.
ALTER TABLE tenant_custom_roles DROP CONSTRAINT tenant_custom_roles_base_role_check;
ALTER TABLE tenant_custom_roles ADD CONSTRAINT tenant_custom_roles_base_role_check
 CHECK(base_role IN ('REQUESTER','SURVEY_MANAGER','SURVEY_SUPERINTENDENT','PARTY_CHIEF',
 'INSTRUMENT_MAN','CAD_TECHNICIAN','CAD_LEAD','VIEWER','AREA_VIEWER',
 'DEPARTMENT_MANAGER','SUBCONTRACTS_COORDINATOR'));
