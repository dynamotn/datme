---
layout: decision
unlisted: true
title: Search in the browser
description: An example of the decision layout.
status: accepted
date: 2026-02-01
deciders: ["[[cv|Ada]]", Charles]
---

## Context

The site is static. Readers want to search it, offline too, without a
server.

## Considered options

- An index built at build time, searched in the browser
- A hosted search service

## Decision

We build the index at build time and search it in the browser.

## Consequences

The index grows with the garden. Nothing leaves the reader's browser.
