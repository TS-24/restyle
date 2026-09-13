import {
    type RouteConfig,
    index,
    layout,
    route
} from "@react-router/dev/routes";

export default [
    // Outside the workspace layout on purpose: that layout's loader requires a
    // session, so nesting the login page inside it would redirect to itself.
    route("login", "routes/login.tsx"),
    route("register", "routes/register.tsx"),
    route("logout", "routes/logout.tsx"),
    // Outside the layout for the same reason, and more so: whoever opens this
    // is someone who cannot sign in. The link that reaches it is issued from
    // the account page — see routes/menu.tsx.
    route("reset-password", "routes/reset-password.tsx"),
    // The landing page and the grid share a layout so the note surface inside
    // it survives navigation between them — see app/routes/workspace.tsx.
    layout("routes/workspace.tsx", [
        index("routes/home.tsx"),
        route("notes", "routes/notes.tsx"),
    ]),
    route("settings", "routes/menu.tsx"),
    // Both action-only. "chats" is create, rename and delete — the things you
    // do to a conversation from outside it. "chats/:chatId" is saying something
    // and finishing, which are the things you do inside one.
    //
    // Neither is a page. A conversation is shown in its note's place by the
    // workspace layout above, out of chats that layout's loader already
    // returned, so opening one costs no request and leaving one is a movement
    // rather than a route change.
    route("chats", "routes/chats.tsx"),
    route("chats/:chatId", "routes/chat.tsx"),
    // Resource route (loader only, no component). Deliberately outside the
    // layout: a submission inside the workspace would drag the note list's
    // revalidation along with it.
    route("api/active-model", "routes/api.active-model.tsx"),
] satisfies RouteConfig;
