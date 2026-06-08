import { useMemo, useState } from 'react';
import type { AudioDeviceChoice, AudioDeviceReport, AudioDeviceSettings } from '@greenroom/shared';
import { Button, SelectField } from './ui';

function isVirtualDeviceName(name: string): boolean {
  return /\bVB(?:-Audio)?\b|VB-Audio Virtual Cable|\bCABLE(?:[-\s]?[A-D])?\b|CABLE\s+(Input|Output|In|Out)/i.test(name);
}

function cleanDeviceName(name: string): string {
  return name
    .replace(/\s*\(VB-Audio Virtual Cable\)\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function friendlyDeviceName(device: AudioDeviceChoice, purpose: 'restore' | 'route' | 'capture'): string {
  if (device.isVirtualCable || isVirtualDeviceName(device.name)) {
    if (purpose === 'capture') return 'Greenroom capture cable';
    return 'Greenroom virtual cable';
  }
  return cleanDeviceName(device.name) || device.name;
}

function optionsFor(devices: AudioDeviceChoice[], purpose: 'restore' | 'route' | 'capture'): { device: AudioDeviceChoice; label: string }[] {
  const base = devices.map((device) => ({ device, label: friendlyDeviceName(device, purpose) }));
  const counts = new Map<string, number>();
  for (const item of base) counts.set(item.label, (counts.get(item.label) ?? 0) + 1);
  return base.map((item) => ({
    ...item,
    label: (counts.get(item.label) ?? 0) > 1 ? `${item.label} - ${cleanDeviceName(item.device.name)}` : item.label,
  }));
}

function hasDevice(devices: AudioDeviceChoice[], value: string): boolean {
  return devices.some((device) => device.name === value);
}

function isRealOutputName(name: string): boolean {
  return Boolean(name) && !isVirtualDeviceName(name);
}

export function isAudioRoutingReady(report: AudioDeviceReport | null): boolean {
  if (!report) return false;
  return Boolean(report.settings.routeDevice && report.settings.captureDevice && isRealOutputName(report.settings.restoreDevice));
}

export function AudioRoutingPanel({
  report,
  saving,
  onChange,
  onRefresh,
  context = 'settings',
}: {
  report: AudioDeviceReport | null;
  saving: boolean;
  onChange: (patch: Partial<AudioDeviceSettings>) => void;
  onRefresh?: () => void;
  context?: 'settings' | 'onboarding';
}): JSX.Element {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const settings = report?.settings;
  const realOutputs = useMemo(
    () => report?.render.filter((device) => !device.isVirtualCable && !isVirtualDeviceName(device.name)) ?? [],
    [report],
  );
  const routeDevices = useMemo(() => {
    if (!report) return [];
    const virtual = report.render.filter((device) => device.isVirtualCable || isVirtualDeviceName(device.name));
    return virtual.length > 0 ? virtual : report.render;
  }, [report]);
  const captureDevices = useMemo(() => {
    if (!report) return [];
    const virtual = report.capture.filter((device) => device.isVirtualCable || isVirtualDeviceName(device.name));
    return virtual.length > 0 ? virtual : report.capture;
  }, [report]);

  const needsAdvanced = Boolean(settings && (!settings.routeDevice || !settings.captureDevice));
  const showAdvanced = advancedOpen || needsAdvanced;
  const restoreValue = settings && isRealOutputName(settings.restoreDevice) ? settings.restoreDevice : '';

  if (!report || !settings) {
    return <div className="rounded-lg border border-line bg-sunken p-3 text-sm text-muted">Loading audio devices...</div>;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-line bg-sunken p-3">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <DeviceSelect
            label={context === 'onboarding' ? 'Where should Spotify play when the bot is off?' : 'When Greenroom is off, play Spotify through'}
            value={restoreValue}
            devices={realOutputs}
            placeholder="Choose headphones or speakers"
            purpose="restore"
            onChange={(restoreDevice) => onChange({ restoreDevice })}
          />
          {onRefresh && (
            <Button variant="ghost" size="sm" disabled={saving} onClick={onRefresh}>
              Refresh
            </Button>
          )}
        </div>
        {!restoreValue && (
          <p className="mt-2 text-xs text-warn">
            Choose your headphones or speakers. Greenroom will return Spotify there when the bot stops.
          </p>
        )}
        {realOutputs.length === 0 && (
          <p className="mt-2 text-xs text-warn">
            Greenroom did not find a normal speaker or headphone output. Connect one, set it up in Windows, then refresh.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>
          {settings.routeDevice && settings.captureDevice
            ? 'Discord streaming uses the virtual cable automatically.'
            : 'Greenroom needs the virtual cable devices before it can stream.'}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setAdvancedOpen((open) => !open)}>
          {showAdvanced ? 'Hide advanced' : 'Advanced'}
        </Button>
      </div>

      {showAdvanced && (
        <div className="grid gap-3 rounded-lg border border-line bg-sunken p-3 md:grid-cols-2">
          <DeviceSelect
            label="Virtual playback cable"
            value={settings.routeDevice}
            devices={routeDevices}
            placeholder="Choose virtual playback cable"
            purpose="route"
            onChange={(routeDevice) => onChange({ routeDevice })}
          />
          <DeviceSelect
            label="Virtual recording cable"
            value={settings.captureDevice}
            devices={captureDevices}
            placeholder="Choose virtual recording cable"
            purpose="capture"
            onChange={(captureDevice) => onChange({ captureDevice })}
          />
          <p className="md:col-span-2 text-xs text-muted">
            Most users should leave these alone. Change them only if Greenroom picked the wrong VB-Cable pair.
          </p>
        </div>
      )}

      <p className="text-xs text-muted">
        {saving ? 'Saving...' : 'Changes apply the next time the bot starts.'}
      </p>
    </div>
  );
}

function DeviceSelect({
  label,
  value,
  devices,
  placeholder,
  purpose,
  onChange,
}: {
  label: string;
  value: string;
  devices: AudioDeviceChoice[];
  placeholder: string;
  purpose: 'restore' | 'route' | 'capture';
  onChange: (value: string) => void;
}): JSX.Element {
  const options = optionsFor(devices, purpose);
  return (
    <SelectField label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {value && !hasDevice(devices, value) && <option value={value}>{cleanDeviceName(value)}</option>}
      {options.map(({ device, label: optionLabel }) => (
        <option key={`${device.kind}:${device.id}:${device.name}`} value={device.name}>
          {optionLabel}
        </option>
      ))}
    </SelectField>
  );
}
