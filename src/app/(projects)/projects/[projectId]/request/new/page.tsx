'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import { getErrorMessage } from '@/lib/errors';
import type { ProjectRequestConfig, TicketType, UploadAttachmentRequest } from '@/lib/contracts';
import { AorNodePicker } from '@/components/aor';
import { Field, Stepper } from '@/components/forms';
import { AttachmentUploader } from '@/components/tickets';
import {
  Button,
  Card,
  ErrorBanner,
  Input,
  Select,
  SuccessBanner,
  Textarea,
} from '@/components/ui';

const STEP_TITLES = ['AOR', 'Type', 'Date', 'Details', 'Attachments', 'Review'];
const TICKET_TYPES: TicketType[] = ['LAYOUT', 'CHECK_OUT', 'AS_BUILT', 'TOPO', 'PERMIT'];
const CRAFT_OPTIONS = ['Civil', 'Structural', 'Mechanical', 'Electrical', 'Instrumentation', 'Survey', 'Other'];

function dateStringFromNow(daysAhead: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

export default function NewRequestPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const projectId = params.projectId;

  const [activeStep, setActiveStep] = useState(0);
  const [aorNodeId, setAorNodeId] = useState('');
  const [ticketType, setTicketType] = useState<TicketType>('LAYOUT');
  const [requestConfig, setRequestConfig] = useState<ProjectRequestConfig>({
    leadTimeEnforcementEnabled: true,
    leadTimeDays: 2,
  });
  const [requestedDate, setRequestedDate] = useState(dateStringFromNow(2));
  const [craft, setCraft] = useState(CRAFT_OPTIONS[0] ?? 'Civil');
  const [customCraft, setCustomCraft] = useState('');
  const [fieldContact, setFieldContact] = useState('');
  const [fieldChannel, setFieldChannel] = useState('');
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<UploadAttachmentRequest[]>([]);
  const [aorLevels, setAorLevels] = useState<Array<{ id: string; depth: number; label: string }>>([]);
  const [aorNodes, setAorNodes] = useState<
    Array<{ id: string; levelId: string; parentId: string | null; name: string; code: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loadingAor, setLoadingAor] = useState(true);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const minRequestedDate = useMemo(() => {
    if (!requestConfig.leadTimeEnforcementEnabled) {
      return dateStringFromNow(0);
    }
    return dateStringFromNow(requestConfig.leadTimeDays);
  }, [requestConfig.leadTimeDays, requestConfig.leadTimeEnforcementEnabled]);

  const resolvedCraft = useMemo(
    () => (craft === 'Other' ? customCraft.trim() : craft.trim()),
    [craft, customCraft],
  );

  useEffect(() => {
    let active = true;
    async function loadSetupData() {
      setLoadingAor(true);
      setLoadingConfig(true);
      setError(null);
      try {
        const [aorResponse, configResponse] = await Promise.all([
          apiClient.listAorTree(projectId),
          apiClient.getProjectRequestConfig(projectId),
        ]);
        if (!active) return;
        setAorLevels(aorResponse.levels);
        setAorNodes(aorResponse.nodes);
        setRequestConfig(configResponse.config);
      } catch (err) {
        if (!active) return;
        setError(getErrorMessage(err, 'Unable to load request setup data.'));
      } finally {
        if (active) {
          setLoadingAor(false);
          setLoadingConfig(false);
        }
      }
    }

    void loadSetupData();
    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (!requestedDate) {
      setRequestedDate(minRequestedDate);
      return;
    }
    if (requestConfig.leadTimeEnforcementEnabled && requestedDate < minRequestedDate) {
      setRequestedDate(minRequestedDate);
    }
  }, [minRequestedDate, requestConfig.leadTimeEnforcementEnabled, requestedDate]);

  const stagedAttachmentsSummary = useMemo(
    () => attachments.map((item) => `${item.filename} (${item.sizeBytes} bytes)`),
    [attachments],
  );

  const isStepComplete = useMemo(() => {
    switch (activeStep) {
      case 0:
        return Boolean(aorNodeId.trim());
      case 1:
        return Boolean(ticketType);
      case 2:
        return Boolean(requestedDate);
      case 3:
        return Boolean(resolvedCraft && fieldContact.trim() && fieldChannel.trim() && description.trim());
      default:
        return true;
    }
  }, [activeStep, aorNodeId, description, fieldChannel, fieldContact, requestedDate, resolvedCraft, ticketType]);

  async function handleSubmit() {
    if (
      !aorNodeId ||
      !ticketType ||
      !requestedDate ||
      !resolvedCraft ||
      !fieldContact.trim() ||
      !fieldChannel.trim() ||
      !description.trim()
    ) {
      setError('Complete all required fields before submission.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const created = await apiClient.createTicket({
        projectId,
        aorNodeId: aorNodeId.trim(),
        ticketType,
        craft: resolvedCraft,
        fieldContact: fieldContact.trim(),
        fieldChannel: fieldChannel.trim(),
        description: description.trim(),
        requestedDate: new Date(requestedDate).toISOString(),
      });

      const ticketId = created.ticket.id;
      for (const attachment of attachments) {
        await apiClient.uploadAttachment(ticketId, attachment);
      }

      const submitted = await apiClient.submitTicket(ticketId);
      setSuccess(`Ticket ${submitted.ticket.ticketNumber ?? submitted.ticket.id} submitted.`);
      router.push(`/projects/${projectId}/tickets/${ticketId}`);
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to submit request.'));
    } finally {
      setSubmitting(false);
    }
  }

  function renderStepBody() {
    switch (activeStep) {
      case 0:
        return (
          <div className="stack">
            {loadingAor ? <p className="muted">Loading AOR tree...</p> : null}
            {aorNodes.length > 0 ? (
              <Field label="AOR Node">
                <AorNodePicker levels={aorLevels} nodes={aorNodes} value={aorNodeId} onChange={setAorNodeId} />
              </Field>
            ) : (
              <Field label="AOR Node ID">
                <Input value={aorNodeId} onChange={(event) => setAorNodeId(event.target.value)} />
              </Field>
            )}
          </div>
        );
      case 1:
        return (
          <Field label="Ticket Type">
            <Select value={ticketType} onChange={(event) => setTicketType(event.target.value as TicketType)}>
              {TICKET_TYPES.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </Select>
          </Field>
        );
      case 2:
        return (
          <div className="stack">
            <Field label="Requested Date">
              <Input
                type="date"
                min={requestConfig.leadTimeEnforcementEnabled ? minRequestedDate : undefined}
                value={requestedDate}
                onChange={(event) => setRequestedDate(event.target.value)}
              />
            </Field>
            <p className="muted">
              {loadingConfig
                ? 'Loading request date policy...'
                : requestConfig.leadTimeEnforcementEnabled
                  ? `Lead-time policy enabled: minimum ${requestConfig.leadTimeDays} day(s) ahead.`
                  : 'Lead-time policy disabled for this project.'}
            </p>
          </div>
        );
      case 3:
        return (
          <div className="stack">
            <Field label="Craft / Discipline">
              <Select value={craft} onChange={(event) => setCraft(event.target.value)}>
                {CRAFT_OPTIONS.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </Select>
            </Field>
            {craft === 'Other' ? (
              <Field label="Custom Craft / Discipline">
                <Input value={customCraft} onChange={(event) => setCustomCraft(event.target.value)} />
              </Field>
            ) : null}
            <Field label="Field Contact">
              <Input value={fieldContact} onChange={(event) => setFieldContact(event.target.value)} />
            </Field>
            <Field label="Phone / Radio Channel">
              <Input value={fieldChannel} onChange={(event) => setFieldChannel(event.target.value)} />
            </Field>
            <Field label="Description">
              <Textarea value={description} onChange={(event) => setDescription(event.target.value)} />
            </Field>
          </div>
        );
      case 4:
        return (
          <div className="stack">
            <p className="muted">Optional: stage attachment metadata now; files upload after ticket draft is created.</p>
            <AttachmentUploader
              onUpload={async (payload) => {
                setAttachments((current) => [...current, payload]);
              }}
            />
            {attachments.length > 0 ? (
              <ul className="stack" style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {stagedAttachmentsSummary.map((item) => (
                  <li key={item} className="muted">{item}</li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      default:
        return (
          <div className="stack">
            <p className="muted">AOR Node: {aorNodeId || '-'}</p>
            <p className="muted">Type: {ticketType}</p>
            <p className="muted">Requested Date: {requestedDate}</p>
            <p className="muted">Craft / Discipline: {resolvedCraft || '-'}</p>
            <p className="muted">Field Contact: {fieldContact || '-'}</p>
            <p className="muted">Phone / Radio Channel: {fieldChannel || '-'}</p>
            <p className="muted">Description: {description || '-'}</p>
            <p className="muted">Attachments: {attachments.length}</p>
          </div>
        );
    }
  }

  return (
    <Card
      title="New Request"
      description="Mobile-first request submission flow. Workflow validation remains backend-enforced."
    >
      <div className="stack">
        <Stepper steps={STEP_TITLES} activeStep={activeStep} />
        {error ? <ErrorBanner message={error} /> : null}
        {success ? <SuccessBanner message={success} /> : null}
        {renderStepBody()}
        <div className="row">
          <Button
            variant="secondary"
            disabled={activeStep === 0 || submitting}
            onClick={() => setActiveStep((current) => Math.max(0, current - 1))}
          >
            Back
          </Button>
          {activeStep < STEP_TITLES.length - 1 ? (
            <Button
              disabled={submitting || !isStepComplete}
              onClick={() => setActiveStep((current) => Math.min(STEP_TITLES.length - 1, current + 1))}
            >
              Next
            </Button>
          ) : (
            <Button disabled={submitting} onClick={() => void handleSubmit()}>
              {submitting ? 'Submitting...' : 'Submit Request'}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
