import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { Box, Button, MenuItem, TextField, Typography } from '@mui/material';
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { agentAccessOf, type AccessPolicy, type ConnectionInfo } from '../../store/client';
import { useStores } from '../../store/store-container';
import ConfirmDialog from '../ConfirmDialog';
import { PolicyRules } from './DataMaskingRules';
import ToggleRow from './ToggleRow';

/**
 * A rule set's name as people see it. The built-in one is stored as
 * "Default"; on screen it is Recommended, as everywhere else.
 */
export const ruleSetName = (set: AccessPolicy) => (set.builtIn ? 'Recommended' : set.name);

const actionSx = { textTransform: 'none', color: 'var(--primary-color)', px: 0.75, fontSize: 13 } as const;

/**
 * What AI agents may do on one database, at the top of its settings in
 * Database Connections. Two switches, one question each:
 *
 * 1. Can agents use this database at all?
 * 2. If they can, are columns that may hold personal or secret data masked?
 *
 * Turning agents on masks with the recommended rules straight away: the
 * safe choice needs no question. Turning masking off asks first, since it
 * weakens protection. Turning anything else off is instant.
 *
 * Underneath, the two switches are the three agent-access states the
 * desktop app stores (setAgentAccess): off, masked and every column.
 */
const AgentAccessSettings = observer(
  ({ connection, focusedRuleId }: { connection: ConnectionInfo; focusedRuleId?: string }) => {
    const { global } = useStores();
    const { id, label, applyPolicyToOwnQueries } = connection;
    const access = agentAccessOf(connection);
    const agentsOn = access !== 'off';
    const masked = access === 'masked';
    const ownPolicy = global.connectionPolicy(id);
    const rulesOn = ownPolicy?.rules.filter(m => m.enabled).length ?? 0;
    const [asking, setAsking] = useState<'unmask' | 'start-over' | null>(null);
    const [startFrom, setStartFrom] = useState('');

    const recommendedId =
      global.policyTemplates.find(t => t.builtIn)?.id ?? global.policyTemplates[0]?.id ?? '';
    // A database without rules of its own gets a copy of Recommended the
    // first time it is masked.
    const maskWith = ownPolicy ? undefined : recommendedId;

    const setAgentsOn = (on: boolean) => {
      void global.setAgentAccess(id, on ? 'masked' : 'off', on ? maskWith : undefined);
    };
    const setMasked = (on: boolean) => {
      if (!on) return setAsking('unmask');
      void global.setAgentAccess(id, 'masked', maskWith);
    };

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        <ToggleRow
          label="AI agents can use this database"
          description="An agent connected to Beamlynx, such as Claude Code, can query it. Its queries open in a tab you can watch."
          checked={agentsOn}
          onChange={setAgentsOn}
        />
        {agentsOn && (
          <ToggleRow
            label="Mask sensitive columns"
            description="Columns that may hold personal or secret data come back to agents as xxxxx. Agents can still filter and join on them."
            checked={masked}
            onChange={setMasked}
            divider={!masked}
          />
        )}
        {access === 'every-column' && (
          <Typography variant="body2" sx={{ color: 'var(--text-warning-color)', pt: 1 }}>
            Agents read every column of this database, unmasked.
          </Typography>
        )}

        {masked && ownPolicy && (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              pl: 2,
              ml: 0.5,
              pb: 1.5,
              borderLeft: '2px solid var(--border-color)',
              borderBottom: '1px solid var(--border-color)',
            }}
          >
            {rulesOn === 0 && (
              <Typography variant="body2" sx={{ color: 'var(--text-warning-color)' }}>
                No rule is on, so nothing is masked. Turn a rule on.
              </Typography>
            )}
            <ToggleRow
              label="Mask my own queries too"
              description="See what agents see: data masking applies to your own queries on this database as well."
              descriptionInTooltip
              divider={false}
              checked={!!applyPolicyToOwnQueries}
              onChange={value => global.setApplyPolicyToOwnQueries(id, value)}
            />
            <Button
              size="small"
              onClick={() => {
                setStartFrom(recommendedId);
                setAsking('start-over');
              }}
              startIcon={<RestartAltIcon sx={{ fontSize: 16 }} />}
              sx={{ ...actionSx, alignSelf: 'flex-start', ml: -0.75 }}
            >
              Start over from…
            </Button>
            <PolicyRules policy={ownPolicy} focusedRuleId={focusedRuleId} />
          </Box>
        )}

        <ConfirmDialog
          open={asking === 'unmask'}
          title="Stop masking for agents?"
          confirmLabel="Stop masking"
          danger
          onConfirm={() => global.setAgentAccess(id, 'every-column')}
          onClose={() => setAsking(null)}
        >
          <p>
            Agents on {label} will read every column of this database, unmasked, including any
            column data masking hides today. Nothing here will limit what they see.
          </p>
          {ownPolicy && <p>Its masking rules are kept. Turn masking back on to apply them again.</p>}
        </ConfirmDialog>

        <ConfirmDialog
          open={asking === 'start-over'}
          title={`Start ${label}'s data masking over?`}
          confirmLabel="Start over"
          confirmDisabled={!startFrom}
          onConfirm={async () => {
            await global.attachTemplate(id, startFrom);
          }}
          onClose={() => setAsking(null)}
        >
          <p>
            Its {ownPolicy?.rules.length ?? 0} rules are replaced by a copy of the set you pick,
            including any rule you added. No other database changes. The sets are on the Agent
            page&apos;s Masking tab.
          </p>
          <TextField
            select
            fullWidth
            size="small"
            label="Start from"
            value={startFrom}
            onChange={e => setStartFrom(e.target.value)}
            sx={{ mt: 1 }}
          >
            {global.policyTemplates.map(t => (
              <MenuItem key={t.id} value={t.id} disabled={!t.rules.some(m => m.enabled)}>
                {ruleSetName(t)}
                {!t.rules.some(m => m.enabled) ? ' (no rule on)' : ''}
              </MenuItem>
            ))}
          </TextField>
        </ConfirmDialog>
      </Box>
    );
  },
);

export default AgentAccessSettings;
