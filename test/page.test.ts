import { describe, expect, it } from "vitest";

import { ElementIterator } from "../src/elementIterator.js";
import { Namespace } from "../src/model/namespace.js";
import { Page } from "../src/model/page.js";
import { nextItem } from "../src/util.js";

describe("page", () => {
  it("test_page", async () => {
    const XML = `
    <page>
        <title>AccessibleComputing</title>
        <ns>0</ns>
        <id>10</id>
        <redirect title="Computer accessibility" />
        <revision>
          <id>233192</id>
          <timestamp>2001-01-21T02:12:21Z</timestamp>
          <contributor>
            <username>RoseParks</username>
            <id>99</id>
          </contributor>
          <comment>*</comment>
          <model>wikitext</model>
          <format>text/x-wiki</format>
          <text xml:space="preserve">Text of rev 233192</text>
          <sha1>8kul9tlwjm9oxgvqzbwuegt9b2830vw</sha1>
        </revision>
        <revision>
          <id>862220</id>
          <parentid>233192</parentid>
          <timestamp>2002-02-25T15:43:11Z</timestamp>
          <contributor>
            <username>Conversion script</username>
            <id>0</id>
          </contributor>
          <minor />
          <comment>Automated conversion</comment>
          <model>wikitext</model>
          <format>text/x-wiki</format>
          <text xml:space="preserve">Text of rev 862220</text>
          <sha1>i8pwco22fwt12yp12x29wc065ded2bh</sha1>
        </revision>
    </page>
    `;
    const page = await Page.fromElement(
      await ElementIterator.fromString(XML),
    );
    expect(page.id).toBe(10);
    expect(page.title).toBe("AccessibleComputing");
    expect(page.namespace).toBe(0);
    expect(page.redirect).toBe("Computer accessibility");
    expect(page.restrictions).toEqual([]); // Should be known to be empty

    let revision = await nextItem(page);
    expect(revision?.id).toBe(233192);
    expect(revision?.page).toBe(page);

    revision = await nextItem(page);
    expect(revision?.id).toBe(862220);
  });

  it("test_page_with_colon_in_title", async () => {
    const XML = `
    <page>
        <title>Accessible: Computing</title>
        <ns>0</ns>
        <id>10</id>
        <redirect title="Computer accessibility" />
        <revision>
          <id>233192</id>
          <timestamp>2001-01-21T02:12:21Z</timestamp>
          <contributor>
            <username>RoseParks</username>
            <id>99</id>
          </contributor>
          <comment>*</comment>
          <model>wikitext</model>
          <format>text/x-wiki</format>
          <text xml:space="preserve">Text of rev 233192</text>
          <sha1>8kul9tlwjm9oxgvqzbwuegt9b2830vw</sha1>
        </revision>
    </page>
    `;
    // When namespace_map is empty, it works:
    let page = await Page.fromElement(await ElementIterator.fromString(XML));
    expect(page.id).toBe(10);
    expect(page.title).toBe("Accessible: Computing");
    expect(page.namespace).toBe(0);
    expect(page.redirect).toBe("Computer accessibility");
    expect(page.restrictions).toEqual([]); // Should be known to be empty

    let revision = await nextItem(page);
    expect(revision?.id).toBe(233192);
    expect(revision?.page).toBe(page);

    // And when it's present, it still works the same:
    page = await Page.fromElement(await ElementIterator.fromString(XML), {});
    expect(page.id).toBe(10);
    expect(page.title).toBe("Accessible: Computing");
    expect(page.namespace).toBe(0);
    expect(page.redirect).toBe("Computer accessibility");
    expect(page.restrictions).toEqual([]); // Should be known to be empty

    revision = await nextItem(page);
    expect(revision?.id).toBe(233192);
    expect(revision?.page).toBe(page);
  });

  it("test_old_page", async () => {
    const XML = `
    <page>
        <title>Talk:AccessibleComputing</title>
        <id>10</id>
        <redirect title="Computer accessibility" />
        <revision>
          <id>233192</id>
          <timestamp>2001-01-21T02:12:21Z</timestamp>
          <contributor>
            <username>RoseParks</username>
            <id>99</id>
          </contributor>
          <comment>*</comment>
          <model>wikitext</model>
          <format>text/x-wiki</format>
          <text xml:space="preserve">Text of rev 233192</text>
          <sha1>8kul9tlwjm9oxgvqzbwuegt9b2830vw</sha1>
        </revision>
    </page>
    `;
    const page = await Page.fromElement(
      await ElementIterator.fromString(XML),
      { Talk: new Namespace(1, "Talk") },
    );
    expect(page.namespace).toBe(1);
  });

  it("test_page_with_discussion", async () => {
    const XML = `
    <page>
        <title>Talk:AccessibleComputing</title>
        <ns>1</ns>
        <id>10</id>
        <redirect title="Computer accessibility" />
        <DiscussionThreading>
          <ThreadSubject>Foo</ThreadSubject>
          <ThreadParent>1</ThreadParent>
          <ThreadAncestor>2</ThreadAncestor>
          <ThreadPage>Bar</ThreadPage>
          <ThreadPage>3</ThreadPage>
          <ThreadAuthor>Baz</ThreadAuthor>
          <ThreadEditStatus>Herp</ThreadEditStatus>
          <ThreadType>Derp</ThreadType>
        </DiscussionThreading>
        <revision>
          <id>862220</id>
          <parentid>233192</parentid>
          <timestamp>2002-02-25T15:43:11Z</timestamp>
          <contributor>
            <username>Conversion script</username>
            <id>0</id>
          </contributor>
          <minor />
          <comment>Automated conversion</comment>
          <model>wikitext</model>
          <format>text/x-wiki</format>
          <text xml:space="preserve">Text of rev 862220</text>
          <sha1>i8pwco22fwt12yp12x29wc065ded2bh</sha1>
        </revision>
    </page>
    `;
    const page = await Page.fromElement(
      await ElementIterator.fromString(XML),
      { Talk: new Namespace(1, "Talk") },
    );
    expect(page.namespace).toBe(1);

    const revision = await nextItem(page);
    expect(revision?.id).toBe(862220);
  });
});
