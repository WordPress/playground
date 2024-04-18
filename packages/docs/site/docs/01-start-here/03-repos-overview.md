# Understanding the Playground Repositories
There are a couple of different repos that serve different purposes in the WordPress Playground project. Here's a quick overview of each:

## [WordPress Playground](https://github.com/WordPress/wordpress-playground/)
This is the main repository for the WordPress Playground project. It contains the core codebase for the project, project boards and issues, and discussions around ongoing project improvements and maintenance.

The repo is there to guide the core contributors to the Playground identify issues, feature requests, and other improvements that need to be made to the project.

Opening issues in the WordPress Playground repository for the "online" version of the Playground, IE: playground.wordpress.net, is a great way to get visibility on a problem or feature request. But there may be a better suited repo below to open the issue, and we'll discuss that shortly.

Searching for issues is a great way to find a fix or workaround, or to see if a feature request has already been made. If you find an issue that matches your problem, you can add a comment to the issue to provide more information or to show that you are also experiencing the same problem.

Explore the WordPress Playground [repository](https://github.com/WordPress/wordpress-playground/)

---

## [Playground Tools]((https://github.com/WordPress/playground-tools/))
This repository contains a collection of tools and utilities that are used to manage and maintain the WordPress Playground project. The tools include scripts for building and deploying the project, as well as utilities for managing the documentation and other project assets.

There are also advanced administration features, integrations such as the Playground Plugin, Blueprint Builder, and Interactive Code Block that live in the Playground Tools repository.

This repository is also the best place to search for issues related to `wp-now` or the `VS Code Extension` for WordPress Playground. If the request you are looking for is not specific to the online version of the Playground, it may be in the Playground Tools repository.

#### Tools that exist in the Playground Tools repository:
- [Blueprint Builder](https://playground.wordpress.net/builder/builder.html) - a tool to create a view Blueprints side-by-side
- [Playground Block](https://wordpress.org/plugins/interactive-code-block/) - embed Playground via a block on your WordPress site
- [Interactive Code Block](https://wordpress.org/plugins/interactive-code-block/) - an interactive code editor to demonstrate and teach your readers how WordPress plugins are built.
- [Playground Plugin](https://wordpress.org/plugins/playground/) - Copy your site or test plugins easily
- [VS Code Extension](https://marketplace.visualstudio.com/items?itemName=WordPressPlayground.wordpress-playground) - Easily spin up WordPress instances in VS Code
- [`wp-now` ](https://www.npmjs.com/package/%40wp-now/wp-now)- a fully featured, extensible environment for WordPress development
- [Pull Request Previewer](https://playground.wordpress.net/wordpress.html) - a tool to preview pull requests in the Playground
- etc.

The list of Playground Tools continues to grow by the day, and we cannot wait to see what exciting tools are added next. Want to contribute? Swing on by the Playground Tools [repository](https://github.com/WordPress/playground-tools/) and see what you can do to help.

---

## [Blueprints Library](https://github.com/WordPress/blueprints-library)
The Blueprints Library is a collection of pre-configured WordPress setups that can be used to quickly create a new WordPress site in the Playground. Each blueprint contains a set of instructions for setting up a specific type of WordPress site, along with the necessary configuration files.

The Blueprints Library repository represents active development on parsing and creating blueprints, and will contain the `PHP`-based - [version 2](https://github.com/WordPress/wordpress-playground/issues/1025) - of Blueprints when development is complete.

While the repository is geared towards software development for the blueprints architecture, feedback is welcome from anyone. Eventually, Blueprints will represent a robust, useful tool that will be merged into WordPress Core.

Please share your feedback: 
- Share your thoughts and ideas in the [Blueprints v2 Specification](https://github.com/WordPress/blueprints/issues/6) issue – or any other issue that interests you
- Start new discussions
- Propose changes through comments and pull requests

Explore the Blueprints Library [repository](https://github.com/WordPress/blueprints-library)

---

## [Blueprints Community](https://github.com/adamziel/blueprints)
The WordPress Blueprints Community Gallery is a place for users to share their Blueprints with others. It's a great place to find inspiration for your own projects, or to learn from others who have already created Blueprints.

There's a very simple contribution flow to adding your own blueprint, the [Blueprints Crash Course](https://github.com/adamziel/blueprints/blob/blueprints-crash-course/docs/index.md), and of course the [Blueprints Gallery](https://github.com/adamziel/blueprints/blob/blueprints-crash-course/GALLERY.md) to check out for ideas. Readers are encouraged to [Submit a Blueprint](https://github.com/adamziel/blueprints/blob/blueprints-crash-course/CONTRIBUTING.md) to the Gallery, and to share their thoughts on the Blueprints Community.

Submitting Issues with Blueprints is perfectly acceptable here, unless it seems more pertinent to submit the blueprint to one of the other repository. For instance, if you're using one of the Playground Tools or seeing a general error with the Playground, the other repositories may be better suited to raise the issue. 

When searching for issues with blueprints, it is recommend to check all of the repositories for the search terms that best describe the error or feature you are looking for.

[Join the Blueprints Community](https://github.com/adamziel/blueprints)

---

## Official Documentation
You are here.

This repository contains documentation for the APIs that help the Playground function.
- [Blueprints API](https://wordpress.github.io/wordpress-playground/blueprints-api/index)
- [Query API](https://wordpress.github.io/wordpress-playground/query-api)
- [JavaScript API](https://wordpress.github.io/wordpress-playground/javascript-api/index)

As well as other useful information about the project.

The documentation here is a work in progress, and we welcome contributions from the community. If you have any questions or suggestions, please feel free to open an issue or submit a pull request.

Most of what you will find is fairly technical, but also helpful for advanced developers who want to extend the Playground or contribute to the project.