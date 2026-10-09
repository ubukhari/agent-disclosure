/**
 * Chat widgets and assistants this check can name from a page's markup: the script it loads, the
 * global it configures, or the element it renders into. Names only what is in the HTML as served;
 * each vendor's greeting and disclosure text are fetched by its own script after the page loads,
 * and this tool does not fetch them (one request, no scraping beyond the URL given).
 *
 * `configKeys` are the inline settings fields of that vendor that can carry the words a person sees
 * first (a title, a greeting), read when the page sets them inline.
 */

export interface Vendor {
  id: string;
  name: string;
  /** substrings of a script src, iframe src or link href */
  hosts: readonly string[];
  /** substrings of inline script text */
  inline: readonly string[];
  /** custom elements it renders into */
  elements: readonly string[];
}

export const VENDORS: readonly Vendor[] = [
  {
    id: "intercom",
    name: "Intercom (Messenger, Fin)",
    hosts: ["widget.intercom.io", "js.intercomcdn.com"],
    inline: ["intercomSettings", "Intercom("],
    elements: [],
  },
  {
    id: "zendesk",
    name: "Zendesk Web Widget / Messaging",
    hosts: ["static.zdassets.com/ekr/snippet.js", "zopim.com"],
    inline: ["zESettings", "zE("],
    elements: [],
  },
  {
    id: "drift",
    name: "Drift",
    hosts: ["js.driftt.com", "drift.com/include"],
    inline: ["drift.load("],
    elements: [],
  },
  {
    id: "hubspot",
    name: "HubSpot chat",
    hosts: ["js.usemessages.com"],
    inline: ["hsConversationsSettings", "HubSpotConversations"],
    elements: [],
  },
  {
    id: "hubspot-tracking",
    name: "HubSpot tracking code (loads HubSpot chat where it is switched on)",
    hosts: ["js.hs-scripts.com"],
    inline: [],
    elements: [],
  },
  {
    id: "crisp",
    name: "Crisp",
    hosts: ["client.crisp.chat"],
    inline: ["CRISP_WEBSITE_ID", "$crisp"],
    elements: [],
  },
  {
    id: "tidio",
    name: "Tidio (Lyro)",
    hosts: ["code.tidio.co"],
    inline: ["tidioChatApi"],
    elements: [],
  },
  {
    id: "livechat",
    name: "LiveChat",
    hosts: ["cdn.livechatinc.com"],
    inline: ["__lc.license", "LiveChatWidget"],
    elements: [],
  },
  { id: "tawk", name: "tawk.to", hosts: ["embed.tawk.to"], inline: ["Tawk_API"], elements: [] },
  {
    id: "freshchat",
    name: "Freshchat",
    hosts: ["wchat.freshchat.com", "snippets.freshchat.com", "fw-cdn.com"],
    inline: ["fcWidget"],
    elements: [],
  },
  {
    id: "olark",
    name: "Olark",
    hosts: ["static.olark.com"],
    inline: ["olark.identify"],
    elements: [],
  },
  {
    id: "helpscout",
    name: "Help Scout Beacon",
    hosts: ["beacon-v2.helpscout.net"],
    inline: ["Beacon('init'", 'Beacon("init"'],
    elements: [],
  },
  { id: "ada", name: "Ada", hosts: ["static.ada.support"], inline: ["adaSettings"], elements: [] },
  {
    id: "chatbase",
    name: "Chatbase",
    hosts: ["chatbase.co/embed", "chatbase.co/chatbot-iframe"],
    inline: ["chatbaseConfig"],
    elements: [],
  },
  {
    id: "voiceflow",
    name: "Voiceflow",
    hosts: ["cdn.voiceflow.com/widget"],
    inline: ["voiceflow.chat.load"],
    elements: [],
  },
  {
    id: "botpress",
    name: "Botpress webchat",
    hosts: ["cdn.botpress.cloud/webchat", "mediafiles.botpress.cloud"],
    inline: ["botpressWebChat", "botpress.init"],
    elements: [],
  },
  {
    id: "dialogflow",
    name: "Dialogflow / Conversational Agents Messenger (Google)",
    hosts: ["gstatic.com/dialogflow-console/fast/messenger"],
    inline: [],
    elements: ["df-messenger", "df-messenger-chat-bubble"],
  },
  {
    id: "botframework",
    name: "Microsoft Copilot Studio / Bot Framework Web Chat",
    hosts: ["cdn.botframework.com", "webchat.botframework.com", "copilotstudio.microsoft.com"],
    inline: ["renderWebChat"],
    elements: [],
  },
  {
    id: "salesforce",
    name: "Salesforce Embedded Messaging",
    hosts: ["service.force.com/embeddedservice", "my.site.com/ESW", "embeddedservice"],
    inline: ["embeddedservice_bootstrap", "embedded_svc"],
    elements: [],
  },
  {
    id: "watson",
    name: "IBM watsonx Assistant web chat",
    hosts: ["web-chat.global.assistant.watson.appdomain.cloud"],
    inline: ["watsonAssistantChatOptions"],
    elements: [],
  },
  { id: "gorgias", name: "Gorgias", hosts: ["config.gorgias.chat"], inline: [], elements: [] },
  {
    id: "kustomer",
    name: "Kustomer",
    hosts: ["cdn.kustomerapp.com"],
    inline: ["Kustomer.start"],
    elements: [],
  },
  {
    id: "front",
    name: "Front Chat",
    hosts: ["chat-assets.frontapp.com"],
    inline: ["FrontChat("],
    elements: [],
  },
  {
    id: "chatwoot",
    name: "Chatwoot",
    hosts: ["/packs/js/sdk.js"],
    inline: ["chatwootSDK"],
    elements: [],
  },
  { id: "landbot", name: "Landbot", hosts: ["cdn.landbot.io"], inline: ["Landbot."], elements: [] },
  {
    id: "reamaze",
    name: "Re:amaze",
    hosts: ["cdn.reamaze.com"],
    inline: ['_support["account"]', "_support['account']"],
    elements: [],
  },
  {
    id: "zoho",
    name: "Zoho SalesIQ",
    hosts: ["salesiq.zoho"],
    inline: ["$zoho.salesiq"],
    elements: [],
  },
  {
    id: "kommunicate",
    name: "Kommunicate",
    hosts: ["widget.kommunicate.io"],
    inline: ["kommunicateSettings"],
    elements: [],
  },
  {
    id: "smartsupp",
    name: "Smartsupp",
    hosts: ["smartsuppchat.com"],
    inline: ["_smartsupp"],
    elements: [],
  },
  { id: "userlike", name: "Userlike", hosts: ["userlike-cdn-widgets"], inline: [], elements: [] },
  {
    id: "forethought",
    name: "Forethought Solve",
    hosts: ["solve-widget.forethought.ai"],
    inline: [],
    elements: [],
  },
  {
    id: "typebot",
    name: "Typebot",
    hosts: ["@typebot.io/js", "typebot.io"],
    inline: ["Typebot.init"],
    elements: ["typebot-bubble", "typebot-standard"],
  },
  {
    id: "flowise",
    name: "Flowise embed",
    hosts: ["flowise-embed"],
    inline: ["Chatbot.init", "Chatbot.initFull"],
    elements: ["flowise-chatbot", "flowise-fullchatbot"],
  },
  {
    id: "chatkit",
    name: "OpenAI ChatKit",
    hosts: ["cdn.platform.openai.com/deployments/chatkit"],
    inline: [],
    elements: ["openai-chatkit"],
  },
];

/** Words in an id, class, role or aria attribute that mark an element as part of a chat UI. */
export const CHAT_CONTEXT =
  /(?:^|[\s_-])(?:chat|chatbot|chat-?widget|live-?chat|messenger|assistant|copilot|bot|conversation|webchat|helpdesk-widget|support-widget|ask-ai|ai-chat)(?:$|[\s_-])|chat|messenger|assistant|webchat/i;

/** Keys that only a chat's settings use: read in any inline chat configuration. */
export const CHAT_KEYS =
  /^(?:chatTitle|chat-title|chat_title|headerTitle|botName|bot_name|assistantName|agentName|welcome\w*|greeting\w*|intro(?:Message|Text)?|initialMessage\w*|firstMessage|starterMessage|launcherText|launcherLabel|composerPlaceholder|botConversationDescription|disclaimer\w*|aiDisclosure\w*)$/i;

/** An inline script that sets a chat configuration object (no vendor named). */
export const CHAT_CONFIG =
  /(?:chat|bot|assistant|messenger|widget)\w*(?:settings|config|configuration|options)\s*[=:(]/i;

/** Settings keys whose string values are words a person sees: read in a named vendor's snippet. */
export const CONFIG_KEYS =
  /^(?:title|subtitle|chatTitle|chat-title|headerTitle|header|botName|bot_name|assistantName|agentName|name|welcome\w*|greeting\w*|intro\w*|initialMessage\w*|firstMessage|starterMessage|launcherText|label|buttonLabel|placeholder|composerPlaceholder|disclaimer\w*|description|botConversationDescription|tagline|headline|message|text)$/i;

/** The settings keys whose value is shown at the first exchange rather than before it. */
export const FIRST_EXCHANGE_KEYS = /welcome|greeting|intro|initial|first|starter|message|text/i;
