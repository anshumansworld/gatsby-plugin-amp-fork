import React, { Fragment } from "react";
import { renderToString } from "react-dom/server";
import { Minimatch } from "minimatch";
import flattenDeep from "lodash.flattendeep";
import dataUriToBuffer from "data-uri-to-buffer";
const JSDOM = eval('require("jsdom")').JSDOM;
// In development, try this to get better types.
// const {JSDOM} = require("jsdom");
const minimatch = require("minimatch");

const ampBoilerplate = `body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-moz-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-ms-animation:-amp-start 8s steps(1,end) 0s 1 normal both;animation:-amp-start 8s steps(1,end) 0s 1 normal both}@-webkit-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-moz-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-ms-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-o-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}`;
const ampNoscriptBoilerplate = `body{-webkit-animation:none;-moz-animation:none;-ms-animation:none;animation:none}`;

const interpolate = (str, map) =>
  str.replace(/{{\s*[\w\.]+\s*}}/g, (match) => map[match.replace(/[{}]/g, "")]);

function errInContext(message, context) {
  throw new Error(message + " " + context.outerHTML);
}

export const onPreRenderHTML = (
  {
    getHeadComponents,
    replaceHeadComponents,
    getPreBodyComponents,
    replacePreBodyComponents,
    getPostBodyComponents,
    replacePostBodyComponents,
    pathname,
  },
  {
    analytics,
    components = [],
    includedPaths = [],
    excludedPaths = [],
    pathIdentifier = "/amp/",
  }
) => {
  const headComponents = flattenDeep(getHeadComponents());
  const preBodyComponents = getPreBodyComponents();
  const postBodyComponents = getPostBodyComponents();
  const isAmp = pathname && pathname.indexOf(pathIdentifier) > -1;
  if (isAmp) {
    const styles = headComponents.reduce((str, x) => {
      if (x.type === "style") {
        if (x.props.dangerouslySetInnerHTML) {
          str += x.props.dangerouslySetInnerHTML.__html;
        }
      } else if (x.key && x.key === "TypographyStyle") {
        str = `${x.props.typography.toString()}${str}`;
      }
      return str;
    }, "");
    replaceHeadComponents([
      <script async src="https://cdn.ampproject.org/v0.js" />,
      <style
        amp-boilerplate=""
        dangerouslySetInnerHTML={{ __html: ampBoilerplate }}
      />,
      <noscript>
        <style
          amp-boilerplate=""
          dangerouslySetInnerHTML={{ __html: ampNoscriptBoilerplate }}
        />
      </noscript>,
      <style amp-custom="" dangerouslySetInnerHTML={{ __html: styles }} />,
      ...components.map((component, i) => {
        let attrName = !component.attrName
          ? "custom-element"
          : component.attrName;
        let customAttr = {
          [attrName]:
            typeof component === "string" ? component : component.name,
        };
        return (
          <script
            key={`custom-element-${i}`}
            async
            {...customAttr}
            src={`https://cdn.ampproject.org/v0/${
              typeof component === "string" ? component : component.name
            }-${typeof component === "string" ? "0.1" : component.version}.js`}
          />
        );
      }),
      analytics !== undefined ? (
        <script
          async
          custom-element="amp-analytics"
          src="https://cdn.ampproject.org/v0/amp-analytics-0.1.js"
        />
      ) : (
        <Fragment />
      ),
      ...headComponents.filter((x) => {
        if (x.type === "style" || x.type === "noscript") return false;
        if (x.type === "script") {
          return x.props.type === "application/ld+json";
        }

        return x.key !== "TypographyStyle";
      }),
    ]);
    replacePreBodyComponents([
      ...preBodyComponents.filter((x) => x.key !== "plugin-google-tagmanager"),
    ]);
    replacePostBodyComponents(
      postBodyComponents.filter((x) => x.type !== "script")
    );
  } else if (
    (excludedPaths.length > 0 &&
      pathname &&
      excludedPaths.findIndex((_path) => new Minimatch(pathname).match(_path)) <
        0) ||
    (includedPaths.length > 0 &&
      pathname &&
      includedPaths.findIndex((_path) => minimatch(pathname, _path)) > -1) ||
    (excludedPaths.length === 0 && includedPaths.length === 0)
  ) {
    // this doesn't play wel with gatsby-browser.js
    // we can add a client side part, or, more easily, we can just  use helmet.
    // replaceHeadComponents([
    //   <link
    //     rel="amphtml"
    //     key="gatsby-plugin-amp-amphtml-link"
    //     href={interpolate(relAmpHtmlPattern, {
    //       canonicalBaseUrl,
    //       pathIdentifier,
    //       pathname
    //     }).replace(/([^:])(\/\/+)/g, "$1/")}
    //   />,
    //   ...headComponents
    // ]);
  }
};

export const onRenderBody = (
  { setHeadComponents, setHtmlAttributes, setPreBodyComponents, pathname },
  { analytics, pathIdentifier = "/amp/", useAmpClientIdApi = false }
) => {
  const isAmp = pathname && pathname.indexOf(pathIdentifier) > -1;
  if (isAmp) {
    setHtmlAttributes({ amp: "" });
    setHeadComponents([
      // <link
      //   rel="canonical"
      //   href={interpolate(relCanonicalPattern, {
      //     canonicalBaseUrl,
      //     pathname
      //   })
      //     .replace(pathIdentifier, "")
      //     .replace(/([^:])(\/\/+)/g, "$1/")}
      // />,
      useAmpClientIdApi ? (
        <meta name="amp-google-client-id-api" content="googleanalytics" />
      ) : (
        <Fragment />
      ),
    ]);
    setPreBodyComponents([
      analytics != undefined ? (
        <amp-analytics
          type={analytics.type}
          data-credentials={analytics.dataCredentials}
          config={
            typeof analytics.config === "string" ? analytics.config : undefined
          }
        >
          {typeof analytics.config === "string" ? (
            <Fragment />
          ) : (
            <script
              type="application/json"
              dangerouslySetInnerHTML={{
                __html: interpolate(JSON.stringify(analytics.config), {
                  pathname,
                }),
              }}
            />
          )}
        </amp-analytics>
      ) : (
        <Fragment />
      ),
    ]);
  }
};

export const replaceRenderer = (
  { bodyComponent, replaceBodyHTMLString, setHeadComponents, pathname },
  { pathIdentifier = "/amp/", facebookAppId = "" }
) => {
  const defaults = {
    image: {
      width: 640,
      height: 475,
      layout: "responsive",
    },
    twitter: {
      width: "390",
      height: "330",
      layout: "responsive",
    },
    iframe: {
      width: 640,
      height: 475,
      layout: "responsive",
    },
  };
  const headComponents = [];
  const isAmp = pathname && pathname.indexOf(pathIdentifier) > -1;
  if (isAmp) {
    const bodyHTML = renderToString(bodyComponent);
    const dom = new JSDOM(bodyHTML);
    /** @type {Document} */
    const document = dom.window.document;

    // convert images to amp-img or amp-anim
    //
    // We do this in three steps:
    // 1. Flatten <picture> tags into just an <img> with a preferred source.
    // 2. Flatten out .gatsby-resp-image-wrapper and infer width/height from it.
    // 3. Replace plain <img> tags.0
    for (const wrapper of Array.from(
      document.getElementsByClassName("gatsby-image-wrapper")
    )) {
      const sns = [
        ...Array.from(wrapper.getElementsByTagName("noscript")),
        ...Array.from(wrapper.getElementsByTagName("script")),
      ];
      for (const n of sns) {
        n.remove();
      }
    }

    const pictures = Array.from(document.getElementsByTagName("picture"));
    for (const picture of pictures) {
      const webp = Array.from(picture.getElementsByTagName("source")).find(
        (source) => source.type === "image/webp"
      );
      const img = Array.from(
        picture.getElementsByTagName("img")
      )[0].cloneNode();
      if (!img) {
        errInContext("Found <picture> without <img> under it.", picture);
      }

      if (webp) {
        // Construct regular <img> from webp.
        img.srcset = webp.srcset;
        // Don't propagate 'sizes'. We set width/height explicitly which ends up giving a better sense for responsive images.
        // img.sizes = webp.sizes;
      }

      picture.parentNode.replaceChild(img, picture);
    }

    // Two kinds of images: (1) responsive ones with a background-image span with a class,
    // and (2) ones with a <div aria-hidden style="width/padding-bottom"><img src="data:"...>
    const resps = Array.from(
      document.getElementsByClassName("gatsby-resp-image-wrapper")
    );
    for (const respImage of resps) {
      /** @type {?HTMLSpanElement} */
      const background = respImage
        .getElementsByClassName("gatsby-resp-image-background-image")
        .item(0);
      const imgs = respImage.getElementsByTagName("img");
      const img = imgs.item(0);
      if (!background)
        errInContext(
          "Found resp image wrapper with no background image.",
          respImage
        );
      if (imgs.length > 1)
        errInContext("Found resp image with multiple img", respImage);
      if (!img) errInContext("Found resp image with no img", respImage);

      const pb = background.style.paddingBottom;
      if (pb.endsWith("%")) {
        img.width = 1000;
        img.height = 10 * parseFloat(pb.slice(0, -1));
      } else {
        errInContext("padding bottom " + pb + " not legal.", respImage);
      }

      img.style = {};
      img.removeAttribute("sizes");
      background.parentNode.removeChild(background);
    }
    const wrappers = Array.from(
      document.getElementsByClassName("gatsby-image-wrapper")
    );
    for (const wrapper_ of wrappers) {
      /** @type {HTMLDivElement} */
      const wrapper = wrapper_;
      const fixed = !!(wrapper.style.width && wrapper.style.height);

      // Laid out like this:
      // <div aria-hidden style="SIZE HINTS"> <--- only if its responsive!
      //   <img src="<DATA SVG with width + height>" />
      // </div>
      // <img|div aria-hidden data-placeholder-image />  <--- IF PLACEHOLDER.
      // <picture> (already converted to img by now)
      // <noscript>  (already stripped)
      //   <picture>
      // </noscript>
      // <script> (already stripped)

      // Strip placeholder image first.
      for (const maybePlaceholder of [
        ...Array.from(wrapper.getElementsByTagName("img")),
        ...Array.from(wrapper.getElementsByTagName("div")),
      ]) {
        if (maybePlaceholder.hasAttribute("data-placeholder-image")) {
          maybePlaceholder.remove();
        }
      }

      let w, h;

      // First, we take care of the initial div and remove it.

      if (fixed) {
        if (
          wrapper.style.width.endsWith("px") &&
          wrapper.style.height.endsWith("px")
        ) {
          w = parseFloat(wrapper.style.width.slice(0, -2));
          h = parseFloat(wrapper.style.height.slice(0, -2));
        } else {
          errInContext(
            "Width/Height in fixed case not legal: " +
              wrapper.style.width +
              " " +
              wrapper.style.height,
            wrapper
          );
        }
      } else {
        const divs = wrapper.getElementsByTagName("div");
        if (divs.length > 1)
          errInContext("Expected one div saw " + divs.length, wrapper);
        if (divs.length == 0) errInContext("Need div for size hints", wrapper);
        const div = divs[0];

        const svgs = div.getElementsByTagName("img");
        if (svgs.length > 1)
          errInContext(
            "Expected one image within div, saw " + svgs.length,
            wrapper
          );
        if (svgs.length == 0) {
          if (
            // Traditional padding-based approach:
            div.style.width.endsWith("%") &&
            div.style.paddingBottom.endsWith("%")
          ) {
            w = 10 * parseFloat(div.style.width.slice(0, -1));
            h = 10 * parseFloat(div.style.paddingBottom.slice(0, -1));
          } else if (div.style.paddingTop.endsWith("%")) {
            w = 1000;
            h = 10 * parseFloat(div.style.paddingTop.slice(0, -1));
          } else {
            errInContext(
              "padding bottom " +
                div.style.paddingBottom +
                " or width " +
                div.style.width +
                " not legal.",
              wrapper
            );
          }
        } else {
          const svg = svgs[0];

          // e.g.
          // data:image/svg+xml;charset=utf-8,%3Csvg height='575' width='840' xmlns='http://www.w3.org/2000/svg' version='1.1'%3E%3C/svg%3E
          const buffer = dataUriToBuffer(svg.src);
          if (!buffer.type.startsWith("image/svg"))
            errInContext(
              "Expected type image/svg, saw " + buffer.type,
              wrapper
            );
          const helper = new dom.window.DOMParser().parseFromString(
            buffer.toString(),
            "text/xml"
          );
          const hElem = helper.firstChild;
          if (!hElem.hasAttribute("width"))
            errInContext("Width must be defined", wrapper);
          if (!hElem.hasAttribute("height"))
            errInContext("Height must be defined", wrapper);

          w = parseInt(hElem.getAttribute("width"), 10);
          h = parseInt(hElem.getAttribute("height"), 10);
        }

        div.parentNode.removeChild(div);
      }

      // Here, we should be left with two images.
      const imgs = Array.from(wrapper.getElementsByTagName("img"));
      if (imgs.length != 1)
        errInContext("Expected exactly one img, saw " + imgs.length, wrapper);

      const img = imgs[0];
      img.width = w;
      img.height = h;
      img.layout = fixed ? "fixed" : "responsive";
      img.style = {};
      img.removeAttribute("sizes");
    }

    // Present string: transform
    // Present null: skip
    // Not-present (undefined): preserve
    const attributeNames = {
      "data-src": "src",
      "data-srcset": "srcset",
      "data-main-image": null,
      "data-gatsby-image-ssr": null,
      loading: null,
      decoding: null,
    };

    const images = Array.from(document.getElementsByTagName("img"));
    images.forEach((image) => {
      image.removeAttribute("loading");
      image.removeAttribute("decoding");
      let ampImage;
      if (image.src && image.src.indexOf(".gif") > -1) {
        ampImage = document.createElement("amp-anim");
        headComponents.push({ name: "amp-anim", version: "0.1" });
      } else {
        ampImage = document.createElement("amp-img");
      }
      for (const key of Object.keys(image.attributes)) {
        const attribute = image.attributes[key];
        if (!attribute.value) continue;

        const renamed = attributeNames[attribute.name.toLowerCase()];
        if (renamed === null) continue;
        const attributeName = renamed || attribute.name;

        if (ampImage.hasAttribute(attributeName) && !renamed) {
          continue;
        }

        ampImage.setAttribute(attributeName, attribute.value);
      }
      const includedAttributes = Object.keys(ampImage.attributes);

      Object.keys(defaults.image).forEach((key) => {
        if (includedAttributes && includedAttributes.indexOf(key) === -1) {
          ampImage.setAttribute(key, defaults.image[key]);
        }
      });
      image.parentNode.replaceChild(ampImage, image);
    });

    // remove 20px by 20px blur up background image CSS as it's > 1000 bytes - not AMP compatible
    const gatsbyRespBackgroundImages = Array.from(
      document.getElementsByClassName("gatsby-resp-image-background-image")
    );
    gatsbyRespBackgroundImages.forEach((gatsbyRespBackgroundImage) => {
      gatsbyRespBackgroundImage.style.backgroundImage = "";
    });

    // convert twitter posts to amp-twitter
    const twitterPosts = Array.from(
      document.getElementsByClassName("twitter-tweet")
    );
    if (twitterPosts.length > 0) {
      headComponents.push({ name: "amp-twitter", version: "0.1" });
    }
    twitterPosts.forEach((post) => {
      const ampTwitter = document.createElement("amp-twitter");
      const attributes = Object.keys(post.attributes);
      const includedAttributes = attributes.map((key) => {
        const attribute = post.attributes[key];
        ampTwitter.setAttribute(attribute.name, attribute.value);
        return attribute.name;
      });
      Object.keys(defaults.twitter).forEach((key) => {
        if (includedAttributes && includedAttributes.indexOf(key) === -1) {
          ampTwitter.setAttribute(key, defaults.twitter[key]);
        }
      });
      // grab the last link in the tweet for the twee id
      const links = Array.from(post.getElementsByTagName("a"));
      const link = links[links.length - 1];
      const hrefArr = link.href.split("/");
      const id = hrefArr[hrefArr.length - 1].split("?")[0];
      ampTwitter.setAttribute("data-tweetid", id);
      // clone the original blockquote for a placeholder
      const _post = post.cloneNode(true);
      _post.setAttribute("placeholder", "");
      ampTwitter.appendChild(_post);
      post.parentNode.replaceChild(ampTwitter, post);
    });

    // convert iframes to amp-iframe or amp-youtube
    const iframes = Array.from(document.getElementsByTagName("iframe"));
    iframes.forEach((iframe) => {
      let ampIframe;
      let attributes;
      if (iframe.src && iframe.src.indexOf("youtube.com/embed/") > -1) {
        headComponents.push({ name: "amp-youtube", version: "0.1" });
        ampIframe = document.createElement("amp-youtube");
        const src = iframe.src.split("/");
        const id = src[src.length - 1].split("?")[0];
        ampIframe.setAttribute("data-videoid", id);
        const placeholder = document.createElement("amp-img");
        placeholder.setAttribute(
          "src",
          `https://i.ytimg.com/vi/${id}/mqdefault.jpg`
        );
        placeholder.setAttribute("placeholder", "");
        placeholder.setAttribute("layout", "fill");
        ampIframe.appendChild(placeholder);

        const forbidden = [
          "allow",
          "allowfullscreen",
          "frameborder",
          "src",
          "loading",
          "sandbox",
        ];
        attributes = Object.keys(iframe.attributes).filter((key) => {
          const attribute = iframe.attributes[key];
          return !forbidden.includes(attribute.name);
        });
      } else {
        headComponents.push({ name: "amp-iframe", version: "0.1" });
        ampIframe = document.createElement("amp-iframe");
        attributes = Object.keys(iframe.attributes);
      }

      const includedAttributes = attributes.map((key) => {
        const attribute = iframe.attributes[key];
        ampIframe.setAttribute(attribute.name, attribute.value);
        return attribute.name;
      });
      Object.keys(defaults.iframe).forEach((key) => {
        if (includedAttributes && includedAttributes.indexOf(key) === -1) {
          ampIframe.setAttribute(key, defaults.iframe[key]);
        }
      });
      iframe.parentNode.replaceChild(ampIframe, iframe);
    });

    // Support videos.
    /** @type {HTMLVideoElement[]} */
    const videos = Array.from(document.getElementsByTagName("video"));
    if (videos.length > 0) {
      headComponents.push({ name: "amp-video", version: "0.1" });
    }

    for (const video of videos) {
      /** @type {HTMLElement} */
      const ampVideo = document.createElement("amp-video");

      // Move all <source> children of video to ampVideo
      for (const source of video.getElementsByTagName("source")) {
        ampVideo.appendChild(source);
      }

      let isResponsive = false;
      for (const attr of video.getAttributeNames()) {
        if (attr === "data-responsive") {
          isResponsive = true;
          continue;
        }
        ampVideo.setAttribute(attr, video.getAttribute(attr));
      }

      ampVideo.setAttribute("layout", isResponsive ? "responsive" : "fixed");

      video.parentNode.replaceChild(ampVideo, video);
    }

    // Custom plugins I have issues with.
    // Replace the container containing the first react-share button with a custom AMP sharing panel.
    // THEN remove the rest if needed.
    let socialAdded = false;
    while (true) {
      /** @type {NodeListOf<HTMLButtonElement>} */
      const buttons = document.getElementsByClassName(
        "react-share__ShareButton"
      );
      if (buttons.length === 0) break;

      socialAdded = true;

      buttons.item(0).parentNode.innerHTML = [
        `<amp-social-share type="twitter"></amp-social-share>`,
        `<amp-social-share type="linkedin"></amp-social-share>`,
        `<amp-social-share type="facebook" data-param-app_id="${facebookAppId.replace(
          '"',
          '\\"'
        )}"></amp-social-share>`,
        `<amp-social-share type="email"></amp-social-share>`,
        `<amp-social-share type="sms"></amp-social-share>`,
        `<amp-social-share type="system"></amp-social-share>`,
      ].join("");
    }

    if (socialAdded) {
      headComponents.push({ name: "amp-social-share", version: "0.1" });
    }

    for (const span of document.getElementsByClassName(
      "react-share__ShareCount"
    )) {
      span.removeAttribute("url");
    }
    for (const button of document.getElementsByClassName(
      "react-share__ShareButton"
    )) {
      button.removeAttribute("via");
      button.removeAttribute("source");
      button.removeAttribute("separator");
    }

    // Auto ads by Adsense
    if (document.getElementsByTagName("amp-auto-ads").length > 0) {
      headComponents.push({ name: "amp-auto-ads", version: "0.1" });
    }

    // Replace things that are just not allowed in AMP.
    const bodyStyles = Array.from(document.body.querySelectorAll("style"));
    const bodyNoScript = Array.from(document.body.querySelectorAll("noscript"));
    for (const toRemove of [...bodyStyles, ...bodyNoScript]) {
      toRemove.parentElement.removeChild(toRemove);
    }

    setHeadComponents(
      Array.from(
        new Map(headComponents.map(({ name, version }) => [name, version]))
      ).map(([name, version], i) => (
        <Fragment key={`head-components-${i}`}>
          <script
            async
            custom-element={name}
            src={`https://cdn.ampproject.org/v0/${name}-${version}.js`}
          />
        </Fragment>
      ))
    );
    replaceBodyHTMLString(document.body.children[0].outerHTML);
  }
};
