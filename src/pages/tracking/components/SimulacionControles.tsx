import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSimulation, resetSimulation, setSimulation, SPEEDS } from '../mock/sim';

const btn = 'w-8 h-8 flex items-center justify-center rounded-md text-slate-700 hover:bg-slate-200 disabled:opacity-40 cursor-pointer';

/** Solo modo mock (la página lo carga en diferido): pausa, más lento, más rápido y reinicio de la simulación. */
export default function SimulacionControles({ onChange }: { onChange: () => void }) {
  const { t } = useTranslation();
  const [sim, setSim] = useState(getSimulation);
  const index = SPEEDS.indexOf(sim.speed);

  const apply = (patch: { speed?: number; paused?: boolean }) => {
    setSim(setSimulation(patch));
    onChange();
  };

  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5" role="group" aria-label={t('tracking.simTitle')}>
      <button type="button" className={btn} onClick={() => apply({ speed: SPEEDS[index - 1] })} disabled={index <= 0} aria-label={t('tracking.simSlower')} title={t('tracking.simSlower')}>
        <i className="ri-rewind-fill" />
      </button>
      <button type="button" className={btn} onClick={() => apply({ paused: !sim.paused })} aria-pressed={sim.paused} aria-label={sim.paused ? t('tracking.simPlay') : t('tracking.simPause')} title={sim.paused ? t('tracking.simPlay') : t('tracking.simPause')}>
        <i className={sim.paused ? 'ri-play-fill' : 'ri-pause-fill'} />
      </button>
      <button type="button" className={btn} onClick={() => apply({ speed: SPEEDS[index + 1] })} disabled={index >= SPEEDS.length - 1} aria-label={t('tracking.simFaster')} title={t('tracking.simFaster')}>
        <i className="ri-speed-fill" />
      </button>
      <button type="button" className={btn} onClick={() => { setSim(resetSimulation()); onChange(); }} aria-label={t('tracking.simReset')} title={t('tracking.simReset')}>
        <i className="ri-restart-line" />
      </button>
      <span className="w-10 text-center text-xs font-semibold text-slate-700 tabular-nums">{sim.paused ? '0×' : `${sim.speed}×`}</span>
    </div>
  );
}
