BEGIN;
SELECT pg_advisory_xact_lock(hashtext('factory:production'));
ALTER TABLE batch_steps ADD COLUMN execution_status varchar(20) NOT NULL DEFAULT 'NOT_STARTED' CHECK(execution_status IN ('NOT_STARTED','IN_PROGRESS','PAUSED','COMPLETED')),
 ADD COLUMN completed_quantity integer NOT NULL DEFAULT 0 CHECK(completed_quantity>=0),
 ADD COLUMN execution_finished_at timestamptz,
 ADD COLUMN execution_locked_at timestamptz;
CREATE TABLE batch_execution_requests (
 request_id uuid PRIMARY KEY, batch_id uuid NOT NULL REFERENCES production_batches(id), actor_id uuid NOT NULL REFERENCES users(id),
 intent_hash text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE batch_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL, step_id varchar(80) NOT NULL,
 employee_id uuid NOT NULL REFERENCES employees(id), planned_quantity integer CHECK(planned_quantity>0),
 assigned_at timestamptz NOT NULL, status varchar(20) NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','COMPLETED','CANCELLED')),
 note text, created_by uuid NOT NULL REFERENCES users(id), updated_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(batch_id,step_id) REFERENCES batch_steps(batch_id,step_id) ON DELETE RESTRICT,
 UNIQUE(batch_id,step_id,employee_id)
);
CREATE TABLE batch_outputs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL, step_id varchar(80) NOT NULL,
 work_reference varchar(160) NOT NULL CHECK(btrim(work_reference)<>''), quantity integer NOT NULL CHECK(quantity>0),
 occurred_at timestamptz NOT NULL, note text, created_by uuid NOT NULL REFERENCES users(id),
 FOREIGN KEY(batch_id,step_id) REFERENCES batch_steps(batch_id,step_id) ON DELETE RESTRICT,
 UNIQUE(batch_id,step_id,work_reference)
);
CREATE TABLE batch_output_contributions (
 output_id uuid NOT NULL REFERENCES batch_outputs(id) ON DELETE RESTRICT,
 assignment_id uuid NOT NULL REFERENCES batch_assignments(id) ON DELETE RESTRICT,
 quantity integer NOT NULL CHECK(quantity>0), PRIMARY KEY(output_id,assignment_id)
);
CREATE TABLE batch_material_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL, step_id varchar(80) NOT NULL,
 employee_id uuid NOT NULL REFERENCES employees(id), material_type varchar(20) NOT NULL CHECK(material_type IN ('GOLD','SILVER','GEM','OTHER')),
 material_name varchar(120) NOT NULL, unit varchar(10) NOT NULL CHECK(unit IN ('G','PCS','CARAT')),
 quantity numeric(20,4) NOT NULL CHECK(quantity>0),
 kind varchar(30) NOT NULL CHECK(kind IN ('INITIAL','ADDITIONAL','RETURN_UNUSED','RECEIVE_PRODUCT','TRANSFER_IN','TRANSFER_OUT')),
 effect integer NOT NULL DEFAULT 1 CHECK(effect IN (-1,1)), group_id uuid NOT NULL,
 reverses_id uuid UNIQUE REFERENCES batch_material_movements(id) ON DELETE RESTRICT,
 occurred_at timestamptz NOT NULL, note text, created_by uuid NOT NULL REFERENCES users(id), confirmed_by uuid REFERENCES users(id),
 FOREIGN KEY(batch_id,step_id) REFERENCES batch_steps(batch_id,step_id) ON DELETE RESTRICT,
 CHECK(material_type NOT IN ('GOLD','SILVER') OR unit='G')
);
CREATE INDEX batch_material_balance_idx ON batch_material_movements(batch_id,step_id,employee_id,material_type,material_name,unit);
CREATE TABLE batch_loss_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),batch_id uuid NOT NULL,step_id varchar(80) NOT NULL,employee_id uuid NOT NULL REFERENCES employees(id),
 material_type varchar(20) NOT NULL CHECK(material_type IN ('GOLD','SILVER','GEM','OTHER')),material_name varchar(120) NOT NULL,
 unit varchar(10) NOT NULL CHECK(unit IN ('G','PCS','CARAT')),quantity numeric(20,4) NOT NULL CHECK(quantity>0),
 direction varchar(10) NOT NULL CHECK(direction IN ('INCREASE','DECREASE')),adjusts_id uuid REFERENCES batch_loss_entries(id) ON DELETE RESTRICT,
 occurred_at timestamptz NOT NULL,reason text NOT NULL CHECK(btrim(reason)<>''),created_by uuid NOT NULL REFERENCES users(id),
 FOREIGN KEY(batch_id,step_id) REFERENCES batch_steps(batch_id,step_id) ON DELETE RESTRICT,
 CHECK(material_type NOT IN ('GOLD','SILVER') OR unit='G')
);
CREATE TABLE batch_labor_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),batch_id uuid NOT NULL,step_id varchar(80) NOT NULL,employee_id uuid NOT NULL REFERENCES employees(id),
 output_id uuid REFERENCES batch_outputs(id) ON DELETE RESTRICT,
 amount numeric(20,4) NOT NULL CHECK(amount>=0),currency char(3) NOT NULL DEFAULT 'THB' CHECK(currency='THB'),
 direction varchar(10) NOT NULL CHECK(direction IN ('INCREASE','DECREASE')),adjusts_id uuid REFERENCES batch_labor_entries(id) ON DELETE RESTRICT,
 rate_per_15g numeric(20,4) CHECK(rate_per_15g>=0),calculation_note text NOT NULL CHECK(btrim(calculation_note)<>''),
 occurred_at timestamptz NOT NULL,created_by uuid NOT NULL REFERENCES users(id),
 status varchar(20) NOT NULL DEFAULT 'RECORDED' CHECK(status='RECORDED'),
 FOREIGN KEY(batch_id,step_id) REFERENCES batch_steps(batch_id,step_id) ON DELETE RESTRICT
);
CREATE TRIGGER batch_outputs_immutable BEFORE UPDATE OR DELETE ON batch_outputs FOR EACH ROW EXECUTE FUNCTION production_reject_history_change();
CREATE TRIGGER batch_contributions_immutable BEFORE UPDATE OR DELETE ON batch_output_contributions FOR EACH ROW EXECUTE FUNCTION production_reject_history_change();
CREATE TRIGGER batch_materials_immutable BEFORE UPDATE OR DELETE ON batch_material_movements FOR EACH ROW EXECUTE FUNCTION production_reject_history_change();
CREATE TRIGGER batch_losses_immutable BEFORE UPDATE OR DELETE ON batch_loss_entries FOR EACH ROW EXECUTE FUNCTION production_reject_history_change();
CREATE TRIGGER batch_labor_immutable BEFORE UPDATE OR DELETE ON batch_labor_entries FOR EACH ROW EXECUTE FUNCTION production_reject_history_change();
CREATE TRIGGER batch_execution_requests_immutable BEFORE UPDATE OR DELETE ON batch_execution_requests FOR EACH ROW EXECUTE FUNCTION production_reject_history_change();
COMMIT;

