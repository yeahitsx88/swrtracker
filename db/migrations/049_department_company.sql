-- Decision 57 / D5: a department may name the company it belongs to, shown as
-- "Department — Company". Optional; existing departments stay unset. The
-- application accepts only a company associated with the department's project.
ALTER TABLE departments ADD COLUMN company_id UUID NULL;
ALTER TABLE departments
  ADD CONSTRAINT departments_company_fk FOREIGN KEY (tenant_id, company_id) REFERENCES companies(tenant_id, id);
CREATE INDEX departments_company ON departments(tenant_id, company_id) WHERE company_id IS NOT NULL;
