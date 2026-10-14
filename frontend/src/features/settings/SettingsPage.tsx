import { useState, type FormEvent } from 'react';
import { useChangePassword, useUpdateProfile } from '../../api/hooks';
import { applyTheme, useCurrentUser } from '../../context/auth';
import { useFeedback } from '../../context/feedback';
import { useWorkspace } from '../../layout/workspace';
import { PageHeader } from '../../components/common';
import { Avatar, Button, Field, Input, Segmented, SectionCard } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { PALETTE } from '../../lib/meta';
import type { UserPreferences } from '../../lib/types';

export default function SettingsPage() {
  return (
    <div className="page page-narrow">
      <PageHeader title="Nastavitve" description="Profil, videz aplikacije in varnost računa." />
      <div className="stack gap-5">
        <ProfileSection />
        <PreferencesSection />
        <PasswordSection />
      </div>
    </div>
  );
}

function ProfileSection() {
  const user = useCurrentUser();
  const update = useUpdateProfile();
  const { success } = useFeedback();
  const [form, setForm] = useState({ firstName: user.firstName, lastName: user.lastName, jobTitle: user.jobTitle ?? '', avatarColor: user.avatarColor });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty =
    form.firstName !== user.firstName || form.lastName !== user.lastName || form.jobTitle !== (user.jobTitle ?? '') || form.avatarColor !== user.avatarColor;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.firstName.trim()) next.firstName = 'Vpišite ime.';
    if (!form.lastName.trim()) next.lastName = 'Vpišite priimek.';
    setErrors(next);
    if (Object.keys(next).length) return;
    try {
      await update.mutateAsync({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        jobTitle: form.jobTitle.trim() || null,
        avatarColor: form.avatarColor,
      });
      success('Profil posodobljen');
    } catch (err) {
      setErrors(err instanceof ApiError && err.fields ? err.fields : { form: err instanceof Error ? err.message : 'Shranjevanje ni uspelo.' });
    }
  };

  return (
    <SectionCard title="Profil">
      <form className="card-pad stack gap-4" onSubmit={submit} noValidate>
        <div className="profile-preview">
          <Avatar user={{ ...form, firstName: form.firstName || '?', lastName: form.lastName || '' }} size={52} />
          <div className="stack">
            <strong>{user.email}</strong>
            <span className="muted small">
              {user.role === 'admin' ? 'Skrbnik' : 'Član'} · registriran {formatDate(user.createdAt, { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
        </div>
        {errors.form && (
          <p className="form-error" role="alert">
            {errors.form}
          </p>
        )}
        <div className="form-grid-2">
          <Field label="Ime" htmlFor="pf-first" error={errors.firstName}>
            <Input id="pf-first" value={form.firstName} maxLength={80} autoComplete="given-name" invalid={Boolean(errors.firstName)} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          </Field>
          <Field label="Priimek" htmlFor="pf-last" error={errors.lastName}>
            <Input id="pf-last" value={form.lastName} maxLength={80} autoComplete="family-name" invalid={Boolean(errors.lastName)} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          </Field>
        </div>
        <Field label="Delovno mesto" htmlFor="pf-title" optional error={errors.jobTitle}>
          <Input id="pf-title" value={form.jobTitle} maxLength={120} placeholder="npr. Frontend razvijalka" autoComplete="organization-title" onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
        </Field>
        <div className="field">
          <span className="field-label" id="pf-color">
            Barva avatarja
          </span>
          <div className="swatches" role="radiogroup" aria-labelledby="pf-color">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={form.avatarColor.toLowerCase() === c.toLowerCase()}
                aria-label={c}
                className="swatch"
                style={{ background: c }}
                onClick={() => setForm({ ...form, avatarColor: c })}
              />
            ))}
          </div>
        </div>
        <div className="row gap-2">
          <Button type="submit" variant="primary" loading={update.isPending} disabled={!dirty}>
            Shrani profil
          </Button>
          {dirty && (
            <Button
              variant="ghost"
              onClick={() => {
                setForm({ firstName: user.firstName, lastName: user.lastName, jobTitle: user.jobTitle ?? '', avatarColor: user.avatarColor });
                setErrors({});
              }}
            >
              Ponastavi
            </Button>
          )}
        </div>
      </form>
    </SectionCard>
  );
}

function PreferencesSection() {
  const user = useCurrentUser();
  const update = useUpdateProfile();
  const { error } = useFeedback();
  const { openShortcuts } = useWorkspace();
  const prefs = user.preferences;

  const save = (patch: UserPreferences) => {
    if (patch.theme) applyTheme(patch.theme);
    if (patch.density) document.documentElement.dataset.density = patch.density;
    update.mutate(
      { preferences: patch },
      {
        onError: (err) => {
          applyTheme(prefs.theme ?? 'system');
          document.documentElement.dataset.density = prefs.density ?? 'comfortable';
          error(err, 'Nastavitve ni bilo mogoče shraniti');
        },
      },
    );
  };

  return (
    <SectionCard title="Videz in delo">
      <div className="card-pad settings-prefs">
        <PrefRow title="Tema" description="Sistemska tema sledi nastavitvi operacijskega sistema.">
          <Segmented
            label="Tema"
            value={prefs.theme ?? 'system'}
            onChange={(theme) => save({ theme })}
            options={[
              { value: 'light', label: 'Svetla' },
              { value: 'dark', label: 'Temna' },
              { value: 'system', label: 'Sistemska' },
            ]}
          />
        </PrefRow>
        <PrefRow title="Gostota prikaza" description="Kompaktni prikaz pokaže več nalog na tabli in v seznamih.">
          <Segmented
            label="Gostota prikaza"
            value={prefs.density ?? 'comfortable'}
            onChange={(density) => save({ density })}
            options={[
              { value: 'comfortable', label: 'Udobna' },
              { value: 'compact', label: 'Kompaktna' },
            ]}
          />
        </PrefRow>
        <PrefRow title="Privzeti pogled projekta" description="Kateri pogled se odpre, ko izberete projekt.">
          <Segmented
            label="Privzeti pogled projekta"
            value={prefs.defaultTaskView ?? 'board'}
            onChange={(defaultTaskView) => save({ defaultTaskView })}
            options={[
              { value: 'board', label: 'Tabla' },
              { value: 'list', label: 'Seznam' },
            ]}
          />
        </PrefRow>
        <PrefRow title="Bližnjice na tipkovnici" description="Hitro ustvarjanje nalog, iskanje in premikanje med pogledi.">
          <Button size="sm" icon="keyboard" onClick={openShortcuts}>
            Prikaži bližnjice
          </Button>
        </PrefRow>
      </div>
    </SectionCard>
  );
}

function PrefRow({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="pref-row">
      <div>
        <strong>{title}</strong>
        <p className="muted small">{description}</p>
      </div>
      {children}
    </div>
  );
}

function PasswordSection() {
  const change = useChangePassword();
  const { success } = useFeedback();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.currentPassword) next.currentPassword = 'Vnesite trenutno geslo.';
    if (form.newPassword.length < 8) next.newPassword = 'Geslo mora imeti vsaj 8 znakov.';
    else if (!/\d/.test(form.newPassword) || !/[A-Za-zčšžČŠŽ]/.test(form.newPassword)) next.newPassword = 'Geslo mora vsebovati vsaj eno črko in eno števko.';
    if (form.confirm !== form.newPassword) next.confirm = 'Gesli se ne ujemata.';
    setErrors(next);
    if (Object.keys(next).length) return;
    try {
      await change.mutateAsync({ currentPassword: form.currentPassword, newPassword: form.newPassword });
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      success('Geslo spremenjeno', 'Seje na drugih napravah so bile odjavljene.');
    } catch (err) {
      setErrors(err instanceof ApiError && err.fields ? err.fields : { form: err instanceof Error ? err.message : 'Sprememba ni uspela.' });
    }
  };

  return (
    <SectionCard title="Geslo">
      <form className="card-pad stack gap-4" onSubmit={submit} noValidate>
        <p className="secondary">Po spremembi gesla bodo vse druge prijavljene seje samodejno odjavljene.</p>
        {errors.form && (
          <p className="form-error" role="alert">
            {errors.form}
          </p>
        )}
        <Field label="Trenutno geslo" htmlFor="pw-current" error={errors.currentPassword}>
          <Input id="pw-current" type="password" autoComplete="current-password" value={form.currentPassword} invalid={Boolean(errors.currentPassword)} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
        </Field>
        <div className="form-grid-2">
          <Field label="Novo geslo" htmlFor="pw-new" error={errors.newPassword} hint="Vsaj 8 znakov, črka in številka.">
            <Input id="pw-new" type="password" autoComplete="new-password" value={form.newPassword} invalid={Boolean(errors.newPassword)} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />
          </Field>
          <Field label="Ponovite novo geslo" htmlFor="pw-confirm" error={errors.confirm}>
            <Input id="pw-confirm" type="password" autoComplete="new-password" value={form.confirm} invalid={Boolean(errors.confirm)} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
          </Field>
        </div>
        <div>
          <Button type="submit" variant="primary" loading={change.isPending}>
            Spremeni geslo
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}
