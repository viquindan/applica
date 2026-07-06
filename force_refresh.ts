import { loadEnvLocal } from './src/lib/loadEnvLocal';
loadEnvLocal();

async function forceRefresh() {
  const { refreshAtsBoardRegistry, getAtsRegistryMetrics } = await import('./src/core/platforms/atsRegistry');

  console.log('[Script] Forzando actualización manual del registro ATS...');
  
  const resultsGreenhouse = await refreshAtsBoardRegistry('greenhouse', 250);
  console.log(`[Script] Greenhouse: ${resultsGreenhouse.filter((r: any) => r.ok).length} válidos de ${resultsGreenhouse.length} revisados`);
  
  const resultsLever = await refreshAtsBoardRegistry('lever', 150);
  console.log(`[Script] Lever: ${resultsLever.filter((r: any) => r.ok).length} válidos de ${resultsLever.length} revisados`);
  
  const resultsAshby = await refreshAtsBoardRegistry('ashby', 150);
  console.log(`[Script] Ashby: ${resultsAshby.filter((r: any) => r.ok).length} válidos de ${resultsAshby.length} revisados`);
  
  const metrics = await getAtsRegistryMetrics();
  console.log(`[Script] Nuevas Métricas Totales:`, metrics);
  process.exit(0);
}

forceRefresh().catch((err) => {
  console.error(err);
  process.exit(1);
});
