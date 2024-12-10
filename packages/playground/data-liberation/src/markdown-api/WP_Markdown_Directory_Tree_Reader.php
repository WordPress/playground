<?php
/**
 * Data Liberation: Markdown reader.
 *
 * This exploration accompanies the WXR reader to inform a generic
 * data importing pipeline that's not specific to a single input format.
 *
 * @TODO: Support multiple data sources – filesystem directory tree, zip file, ...
 * @TODO: Expose a cursor to allow resuming from where we left off.
 */

class WP_Markdown_Directory_Tree_Reader implements Iterator {
	private $file_visitor;
	private $entity;

	private $pending_directory_index;
	private $pending_files = array();
	private $parent_ids    = array();
	private $next_post_id;
	private $is_finished          = false;
	private $entities_read_so_far = 0;

	public function __construct( $root_dir, $first_post_id ) {
		$this->file_visitor = new WP_File_Visitor( realpath( $root_dir ) );
		$this->next_post_id = $first_post_id;
	}

	public function next_entity() {
		while ( true ) {
			if ( null !== $this->pending_directory_index ) {
				$dir       = $this->file_visitor->get_event()->dir;
				$parent_id = $this->parent_ids[ $this->file_visitor->get_current_depth() - 1 ] ?? null;

				if ( false === $this->pending_directory_index ) {
					// No directory index candidate – let's create a fake page
					// just to have something in the page tree.
					$markdown    = '';
					$source_path = $dir->getPathName();
				} else {
					$markdown    = file_get_contents( $this->pending_directory_index->getRealPath() );
					$source_path = $this->pending_directory_index->getRealPath();
				}
				$post_id = $this->next_post_id;
				++$this->next_post_id;
				++$this->entities_read_so_far;
				$this->entity                  = $this->markdown_to_post_entity(
					array(
						'markdown' => $markdown,
						'source_path' => $source_path,
						'post_id' => $post_id,
						'parent_id' => $parent_id,
						'title_fallback' => $this->slug_to_title( $dir->getFileName() ),
					)
				);
				$this->pending_directory_index = null;
				$depth                         = $this->file_visitor->get_current_depth();
				$this->parent_ids[ $depth ]    = $post_id;
				return true;
			}

			while ( count( $this->pending_files ) ) {
				$parent_id    = $this->parent_ids[ $this->file_visitor->get_current_depth() ] ?? null;
				$file         = array_shift( $this->pending_files );
				$this->entity = $this->markdown_to_post_entity(
					array(
						'markdown' => file_get_contents( $file->getRealPath() ),
						'source_path' => $file->getRealPath(),
						'post_id' => $this->next_post_id,
						'parent_id' => $parent_id,
						'title_fallback' => $this->slug_to_title( $file->getFileName() ),
					)
				);
				++$this->next_post_id;
				++$this->entities_read_so_far;
				return true;
			}

			if ( false === $this->next_file() ) {
				break;
			}
		}
		$this->is_finished = true;
		return false;
	}

	public function get_entity(): WP_Imported_Entity {
		return $this->entity;
	}

	protected function markdown_to_post_entity( $options ) {
		$converter = new WP_Markdown_To_Blocks( $options['markdown'] );
		$converter->parse();
		$block_markup = $converter->get_block_markup();
		$frontmatter  = $converter->get_frontmatter();

		$removed_title = $this->remove_first_h1_block_from_block_markup( $block_markup );
		if ( false !== $removed_title ) {
			$block_markup = $removed_title['remaining_html'];
		}

		$post_title = '';
		if ( ! $post_title && ! empty( $removed_title['content'] ) ) {
			$post_title = $removed_title['content'];
		}
		if ( ! $post_title && ! empty( $frontmatter['title'] ) ) {
			// In WordPress Playground docs, the frontmatter title
			// is actually a worse candidate than the first H1 block
			//
			// There will, inevitably, be 10,000 ways people will want
			// to use this importer with different projects. Let's just
			// enable plugins to customize the title resolution.
			$post_title = $frontmatter['title'];
		}
		if ( ! $post_title ) {
			$post_title = $options['title_fallback'];
		}

		$entity_data = array(
			'post_id' => $options['post_id'],
			'post_type' => 'page',
			'guid' => $options['source_path'],
			'post_title' => $post_title,
			'post_content' => $block_markup,
			'post_excerpt' => $frontmatter['description'] ?? '',
			'post_status' => 'publish',
		);

		/**
		 * Technically `source_path` isn't a part of the WordPress post object,
		 * but we need it to resolve relative URLs in the imported content.
		 *
		 * This path is relative to the root directory traversed by this class.
		 */
		if ( ! empty( $options['source_path'] ) ) {
			$source_path = $options['source_path'];
			$root_dir    = $this->file_visitor->get_root_dir();
			if ( str_starts_with( $source_path, $root_dir ) ) {
				$source_path = substr( $source_path, strlen( $root_dir ) );
			}
			$source_path                = ltrim( $source_path, '/' );
			$entity_data['source_path'] = $source_path;
		}

		if ( ! empty( $frontmatter['slug'] ) ) {
			$slug                     = $frontmatter['slug'];
			$last_segment             = substr( $slug, strrpos( $slug, '/' ) + 1 );
			$entity_data['post_name'] = $last_segment;
		}

		if ( isset( $frontmatter['sidebar_position'] ) ) {
			$entity_data['post_order'] = $frontmatter['sidebar_position'];
		}

		if ( $options['parent_id'] ) {
			$entity_data['post_parent'] = $options['parent_id'];
		}
		return new WP_Imported_Entity( 'post', $entity_data );
	}

	private function next_file() {
		$this->pending_files = array();
		$this->entity        = null;
		while ( $this->file_visitor->next() ) {
			$event = $this->file_visitor->get_event();

			$is_root = $event->dir->getPathName() === $this->file_visitor->get_root_dir();
			if ( $is_root ) {
				continue;
			}
			if ( $event->is_exiting() ) {
				// Clean up stale IDs to save some memory when processing
				// large directory trees.
				unset( $this->parent_ids[ $event->dir->getRealPath() ] );
				continue;
			}

			$this->pending_files = $this->choose_relevant_files( $event->files );
			$directory_index_idx = $this->choose_directory_index( $this->pending_files );
			if ( -1 !== $directory_index_idx ) {
				$this->pending_directory_index = $this->pending_files[ $directory_index_idx ];
				unset( $this->pending_files[ $directory_index_idx ] );
			} else {
				$this->pending_directory_index = false;
			}
			return true;
		}
		return false;
	}

	protected function choose_directory_index( $files ) {
		foreach ( $files as $idx => $file ) {
			if ( $this->looks_like_directory_index( $file ) ) {
				return $idx;
			}
		}
		return -1;
	}

	protected function looks_like_directory_index( $file ) {
		return str_contains( $file->getFilename(), 'index' );
	}

	protected function choose_relevant_files( $files ) {
		return array_filter( $files, array( $this, 'is_valid_file' ) );
	}

	protected function is_valid_file( $file ) {
		return 'md' === $file->getExtension();
	}

	protected function slug_to_title( $filename ) {
		$name = pathinfo( $filename, PATHINFO_FILENAME );
		$name = preg_replace( '/^\d+/', '', $name );
		$name = str_replace(
			array( '-', '_' ),
			' ',
			$name
		);
		$name = ucwords( $name );
		return $name;
	}

	private function remove_first_h1_block_from_block_markup( $html ) {
		$p = WP_Markdown_HTML_Processor::create_fragment( $html );
		if ( false === $p->next_tag() ) {
			return false;
		}
		if ( $p->get_tag() !== 'H1' ) {
			return false;
		}
		$depth = $p->get_current_depth();
		$title = '';
		do {
			if ( false === $p->next_token() ) {
				break;
			}
			if ( $p->get_token_type() === '#text' ) {
				$title .= $p->get_modifiable_text() . ' ';
			}
		} while ( $p->get_current_depth() > $depth );

		if ( ! $title ) {
			return false;
		}

		// Move past the closing comment
		$p->next_token();
		if ( $p->get_token_type() === '#text' ) {
			$p->next_token();
		}
		if ( $p->get_token_type() !== '#comment' ) {
			return false;
		}

		return array(
			'content' => trim( $title ),
			'remaining_html' => substr(
				$html,
				$p->get_string_index_after_current_token()
			),
		);
	}

	public function current(): object {
		return $this->get_entity();
	}

	public function next(): void {
		$this->next_entity();
	}

	public function key(): int {
		return $this->entities_read_so_far - 1;
	}

	public function valid(): bool {
		return ! $this->is_finished;
	}

	public function rewind(): void {
		// noop
	}
}
