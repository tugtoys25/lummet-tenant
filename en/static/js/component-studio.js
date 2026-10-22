// Dashboard > Components: the visual editor ("Component Studio").
// Every component type gets a form of plain fields, pickers and previews, so nobody has to type
// JSON or code. The form builds the same Content / Settings values that were always stored; the
// raw boxes stay available under "Advanced" and stay in step. Values the form does not know
// about are kept untouched. DOM calls only (no innerHTML); the server checks every value again.

import { form, panel } from "/static/js/component-studio/context.js";
import { initComponentStudio } from "/static/js/component-studio/main.js";

// The page elements exist only on Dashboard > Components. A module cannot `return` at the top level, so guard instead.
if (form && panel) initComponentStudio();
