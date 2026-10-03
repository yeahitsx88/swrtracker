## verdict

1. Resolved — archived request configuration displays read-only guidance and disabled fields/Save Configuration in the recaptured Project Admin views; source also guards the save handler against loading, saving and archived state. The browser packet records the archived save check passing.
2. Resolved — archived eligible-account, independent-admin and subcontractor tables retain filtering, sorting and pagination while selection eligibility and mutation actions remain blocked. Recaptures show readable records and inspection fields; source separates eligibility from the busy/ownership disable state. Both newly recorded archived filter checks pass.
3. Resolved — TeamManagementEntry shares synchronous CommandOwner ownership in both directions. Existing editors claim before opening or fetching details and keep ownership until close/refresh/success/failure; movement checks ownership before preview and save. Only the opposing fieldset is disabled, preserving the current editor's unchanged retry. This command-state resolution is established in source; archived history screenshots do not exercise enabled moves.

## remaining

Clear for the three scored material fixes. All six required captures were re-read; Project Admin captures now begin with the shell at the document top. No regression from this fix batch identified within verdict scope. Ship covers the scored fixes, not the whole surface.

disposition: ship
