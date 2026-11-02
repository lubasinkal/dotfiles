// Shared test bootstrap: teach plain node what pi's jiti loader already does,
// so `node test-*.ts` resolves "./x.js" imports to ./x.ts.
// Bun and jiti handle this natively; the hook is a no-op there.
import { registerHooks } from "node:module";

if (typeof registerHooks === "function") {
	registerHooks({
		resolve(spec, ctx, next) {
			try {
				return next(spec, ctx);
			} catch (err) {
				if (!spec.endsWith(".js")) throw err;
				return next(`${spec.slice(0, -3)}.ts`, ctx);
			}
		},
	});
}
